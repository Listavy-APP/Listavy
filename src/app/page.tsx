import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { es } from "@/lib/i18n/es";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({ title: es.seo.homeTitle, description: es.seo.homeDescription, path: "/" });
import { getTradeCatalog } from "@/lib/data/trades-server";
import { proLabelOf, tradeMap } from "@/lib/data/trades";
import { getMyReferralCode, referralProgramEnabled } from "@/lib/data/referrals";
import { getProCardsByIds } from "@/lib/data/pros";
import { verifiedKindsByPro } from "@/lib/data/verifiedFlags";
import { searchNationwide } from "@/lib/data/municipalities";
import { getMunicipalities } from "@/lib/data/municipalities-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { avatarUrl } from "@/lib/storage/proFiles";
import { ProMiniCard } from "@/components/home/ProMiniCard";
import { InstallBanner } from "@/components/home/InstallBanner";
import { DateField } from "@/components/home/DateField";
import { HomeIcon } from "@/components/home/HomeIcons";
import type { ProCard } from "@/lib/types/database";

/** Representative category photos only. They do not show a specific pro. */
/** Lines without an entry here get the designed fallback tile (no stock photos). */
const CAT_PHOTO: Record<string, string> = {
  plumber: "/categories/plomero.jpg",
  electrician: "/categories/electricista.jpg",
  ac_technician: "/categories/aire-acondicionado.jpg",
  painter: "/categories/pintor.jpg",
  locksmith: "/categories/cerrajero.jpg",
  carpenter: "/categories/carpintero.jpg",
  blacksmith: "/categories/herrero.jpg",
};

const RAIL_LIMIT = 8;
const NEW_LIMIT = 6;
/** First trades by catalog sort order (the seven originals, then limpieza). */
const SERVICE_LIMIT = 8;
/** Upper bound of search_pros_nationwide (0113). */
const NATIONWIDE_LIMIT = 100;

type HomeParams = { city?: string; m?: string };

export default function HomePage({ searchParams }: { searchParams: Promise<HomeParams> }) {
  return (
    <Suspense fallback={<div className="home" aria-busy="true" />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({ searchParams }: { searchParams: Promise<HomeParams> }) {
  // Read the session, the place, and the referral flag at request time.
  await connection();
  const params = await searchParams;

  const supabase = await createSupabaseServerClient();
  const [catalog, municipalities] = await Promise.all([getTradeCatalog(), getMunicipalities()]);
  const tm = tradeMap(catalog);
  const referralOn = await referralProgramEnabled(supabase);
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  const code = referralOn && userData.user ? await getMyReferralCode(supabase) : null;

  // Place control: preselect only. Backward compatibility: ?city=<legacy key> preselects its municipality (same as /buscar).
  const requestedId = params.m && municipalities.some((x) => x.id === params.m) ? params.m : null;
  const legacyId = !requestedId && params.city ? (municipalities.find((x) => x.legacyCity === params.city)?.id ?? null) : null;
  const preselectId = requestedId ?? legacyId ?? "";

  // Nationwide pros (0113). Ids first, then cards by id. The viewer never sees their own card.
  const nationwide = await searchNationwide(supabase, { trade: null, limit: NATIONWIDE_LIMIT });
  const ids = [...new Set(nationwide.map((r) => r.pro_id))];
  const pros: ProCard[] = (await getProCardsByIds(supabase, ids)).filter((p) => p.id !== userId);

  // Lowest price per trade and overall, from real approved pros only. Missing trade means no price shown.
  const minByTrade = new Map<string, number>();
  for (const p of pros) {
    const cur = minByTrade.get(p.trade);
    if (cur === undefined || p.price_min_dop < cur) minByTrade.set(p.trade, p.price_min_dop);
  }
  const overallMin = pros.length ? Math.min(...pros.map((p) => p.price_min_dop)) : null;

  const nearby = pros.slice(0, RAIL_LIMIT);
  const newest = [...pros]
    .sort((a, b) => (b.verified_at ?? "").localeCompare(a.verified_at ?? ""))
    .slice(0, NEW_LIMIT);

  // Verified icon for the rail cards only (one call for both rails).
  const railIds = [...new Map([...nearby, ...newest].map((p) => [p.id, p])).values()];
  const verifiedKinds = await verifiedKindsByPro(
    supabase,
    railIds.map((p) => ({ id: p.id, isCompany: p.pro_type === "company" })),
  );
  const avatarFor = (p: ProCard) => avatarUrl(supabase, p.avatar_path);
  const services = catalog.slice(0, SERVICE_LIMIT);

  return (
    <div className="home">
      {/* 1. Header: AppHeader in the root layout. */}

      {/* 2. Hero with the search pill. Submits to /buscar with params in the URL. */}
      <section className="hero-block">
        <h1>{es.discover.heroTitle}</h1>
        <form className="search-pill" role="search" action="/buscar" method="get">
          <label className="pill-field">
            <span>{es.discover.whatNeed}</span>
            <select name="trade" defaultValue="">
              <option value="">{es.search.all}</option>
              {catalog.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="pill-field">
            <span>{es.discover.whereNeed}</span>
            <select name="m" defaultValue={preselectId} style={{ minHeight: 44 }}>
              <option value="">{es.discover.allCountry}</option>
              {[...new Set(municipalities.map((x) => x.province))].map((prov) => (
                <optgroup key={prov} label={prov}>
                  {municipalities.filter((x) => x.province === prov).map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <DateField id="home-date" name="date" label={<>{es.discover.when} <em className="muted">{es.discover.whenOptional}</em></>} />
          <button className="button" type="submit">{es.discover.search}</button>
        </form>
        {/* Sign-in link only for visitors. A signed-in user has the account tab. */}
        {userData.user ? null : (
          <p className="muted">
            <Link href="/login">{es.discover.login}</Link>
          </p>
        )}
      </section>

      {/* 3. Trust strip. Qualitative only: no pro or review counts. */}
      <ul className="trust-strip" aria-label={es.discover.trustVerified}>
        <li className="trust-item"><HomeIcon name="shield-check" /><span>{es.discover.trustVerified}</span></li>
        {overallMin !== null ? (
          <li className="trust-item"><HomeIcon name="tag" /><span>{es.discover.trustPrice(overallMin)}</span></li>
        ) : null}
        <li className="trust-item"><HomeIcon name="lock" /><span>{es.discover.trustSecure}</span></li>
        <li className="trust-item"><HomeIcon name="ribbon" /><span>{es.discover.trustGuarantee}</span></li>
      </ul>

      {/* 4. Service grid: first trades by catalog order. "Desde" only when an approved pro in that trade has a price. */}
      <section id="oficios" className="home-sec">
        <h2>{es.discover.tilesTitle}</h2>
        <div className="tile-grid">
          {services.map((t) => {
            const min = minByTrade.get(t.key);
            const photo = CAT_PHOTO[t.key];
            return (
              <Link key={t.key} className="tile" href={`/buscar?trade=${t.key}`}>
                {photo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img className="tile-photo" src={photo} alt="" loading="lazy" />
                ) : (
                  <span className="tile-photo tile-photo-fallback" aria-hidden="true" />
                )}
                <span className="tile-name">{t.label}</span>
                {min !== undefined ? <span className="tile-price">{es.discover.tileFrom(es.money.dop(min))}</span> : null}
              </Link>
            );
          })}
        </div>
        <Link className="button secondary" href="/buscar">{es.discover.seeAllServices}</Link>
      </section>

      {/* 5. Verified pros. Rendered only when there are pros. */}
      {nearby.length > 0 ? (
        <section className="home-sec">
          <h2>{es.discover.nearTitle}</h2>
          <div className="rail">
            {nearby.map((p) => <ProMiniCard key={p.id} pro={p} tradeLabel={proLabelOf(tm, p.trade)} avatarSrc={avatarFor(p)} verified={verifiedKinds.get(p.id) ?? null} />)}
          </div>
        </section>
      ) : null}

      {/* 6. New on Listavy: newest approved first. Rendered only when there are pros. */}
      {newest.length > 0 ? (
        <section className="home-sec">
          <h2>{es.discover.newTitle}</h2>
          <div className="rail">
            {newest.map((p) => <ProMiniCard key={p.id} pro={p} tradeLabel={proLabelOf(tm, p.trade)} avatarSrc={avatarFor(p)} verified={verifiedKinds.get(p.id) ?? null} />)}
          </div>
        </section>
      ) : null}

      {/* 7. How it works. */}
      <section className="home-sec">
        <h2>{es.discover.howTitle}</h2>
        <ol className="steps">
          <li>{es.discover.step1}</li>
          <li>{es.discover.step2}</li>
          <li>{es.discover.step3}</li>
        </ol>
        <Link className="button secondary" href="/ayuda">{es.discover.howMore}</Link>
      </section>

      {/* 8. Referral strip. Only when the referral flag is on. */}
      {referralOn ? (
        <Link className="notice" href={userData.user ? "/cuenta" : "/login"}>
          <b>{es.referral.bannerTitle}</b>
          <span>
            {code
              ? `${es.referral.yourCode}: ${code}`
              : userData.user
                ? es.referral.bannerSub
                : es.referral.bannerSubGuest}
          </span>
        </Link>
      ) : null}

      {/* 9. Why Listavy. */}
      <section className="home-sec">
        <h2>{es.discover.whyTitle}</h2>
        <ul className="why-list">
          <li>{es.discover.whyVerified}</li>
          <li>{es.discover.whyPay}</li>
          <li>{es.discover.whyPrice}</li>
          <li>{es.discover.whySupport}</li>
        </ul>
      </section>

      {/* 10. App install banner. */}
      <InstallBanner />

      {/* 11. Pro recruitment: navy card, distinct from the sections above. */}
      <section className="pro-cta" aria-labelledby="pro-cta-title">
        <h2 id="pro-cta-title">{es.discover.proCtaTitle}</h2>
        <p>{es.discover.proCtaBenefit}</p>
        <Link className="button pro-cta-button" href="/pro/registro">{es.discover.proCtaButton}</Link>
      </section>

      {/* 12. Footer: LegalFooter in the root layout. */}
    </div>
  );
}
