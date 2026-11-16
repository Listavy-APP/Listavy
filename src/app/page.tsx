import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { es } from "@/lib/i18n/es";
import { TRADES, DEFAULT_CITY, CITIES, isCity, type City } from "@/lib/domain/catalog";
import { getMyReferralCode, referralProgramEnabled } from "@/lib/data/referrals";
import { listProCards } from "@/lib/data/pros";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { avatarUrl } from "@/lib/storage/proFiles";
import { CityZoneSelect } from "@/components/CityZoneSelect";
import { ProMiniCard } from "@/components/home/ProMiniCard";
import { InstallBanner } from "@/components/home/InstallBanner";
import type { ProCard } from "@/lib/types/database";

/** Representative category photos only. They do not show a specific pro. */
const CAT_PHOTO: Record<(typeof TRADES)[number], string> = {
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

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  return (
    <Suspense fallback={<div className="home" aria-busy="true" />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  // Read the session, the city, and the referral flag at request time.
  await connection();
  const params = await searchParams;
  const city: City = params.city && isCity(params.city) ? params.city : DEFAULT_CITY;

  const supabase = await createSupabaseServerClient();
  const referralOn = await referralProgramEnabled(supabase);
  const { data: userData } = await supabase.auth.getUser();
  const code = referralOn && userData.user ? await getMyReferralCode(supabase) : null;

  // Approved, available-or-not pros in this city. The demo pro is excluded by the query.
  const pros: ProCard[] = await listProCards(supabase, { city });

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
  const avatarFor = (p: ProCard) => avatarUrl(supabase, p.avatar_path);

  return (
    <div className="home">
      {/* 1. Header: AppHeader in the root layout. */}

      {/* 2. Hero with the 3-field search pill. Submits to /buscar with params in the URL. */}
      <section className="hero-block">
        <h1>{es.discover.heroTitle}</h1>
        <form className="search-pill" role="search" action="/buscar" method="get">
          <label className="pill-field">
            <span>{es.discover.whatNeed}</span>
            <select name="trade" defaultValue="">
              <option value="">{es.search.all}</option>
              {TRADES.map((t) => (
                <option key={t} value={t}>{es.discover.tileNames[t]}</option>
              ))}
            </select>
          </label>
          <CityZoneSelect cityName="city" zoneName="zone" zoneLabel={es.search.zone} defaultCity={city} allZonesLabel={es.search.allZones} />
          <label className="pill-field">
            <span>{es.discover.when} <em className="muted">{es.discover.whenOptional}</em></span>
            <input type="date" name="date" />
          </label>
          <button className="button" type="submit">{es.discover.search}</button>
        </form>
        <p className="muted">
          <Link href="/login">{es.discover.login}</Link>
        </p>
      </section>

      {/* 3. Trust strip. Qualitative only: no pro or review counts. */}
      <ul className="trust-strip" aria-label={es.discover.trustVerified}>
        <li>✓ {es.discover.trustVerified}</li>
        {overallMin !== null ? <li>{es.discover.trustPrice(overallMin)}</li> : null}
        <li>{es.discover.trustSecure}</li>
        <li>{es.discover.trustGuarantee}</li>
      </ul>

      {/* 4. Trade tiles. "Desde" only when an approved pro in that trade has a price. */}
      <section id="oficios" className="home-sec">
        <h2>{es.discover.tilesTitle}</h2>
        <div className="tile-grid">
          {TRADES.map((t) => {
            const min = minByTrade.get(t);
            return (
              <Link key={t} className="tile" href={`/buscar?trade=${t}&city=${city}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="tile-photo" src={CAT_PHOTO[t]} alt="" loading="lazy" />
                <span className="tile-name">{es.discover.tileNames[t]}</span>
                {min !== undefined ? <span className="tile-price">{es.discover.tileFrom(es.money.dop(min))}</span> : null}
              </Link>
            );
          })}
        </div>
      </section>

      {/* 5. Verified pros near you. Empty state when there are none. */}
      <section className="home-sec">
        <h2>{es.discover.nearTitle}</h2>
        {nearby.length === 0 ? (
          <div className="empty-block">
            <p className="muted">{es.discover.emptyPros}</p>
            <a className="button secondary" href="#oficios">{es.discover.browseTrades}</a>
          </div>
        ) : (
          <div className="rail">
            {nearby.map((p) => <ProMiniCard key={p.id} pro={p} avatarSrc={avatarFor(p)} />)}
          </div>
        )}
      </section>

      {/* 6. New on Listavy: newest approved first. Same empty state. */}
      <section className="home-sec">
        <h2>{es.discover.newTitle}</h2>
        {newest.length === 0 ? (
          <div className="empty-block">
            <p className="muted">{es.discover.emptyPros}</p>
          </div>
        ) : (
          <div className="rail">
            {newest.map((p) => <ProMiniCard key={p.id} pro={p} avatarSrc={avatarFor(p)} />)}
          </div>
        )}
      </section>

      {/* 7. How it works. */}
      <section className="home-sec">
        <h2>{es.discover.howTitle}</h2>
        <ol className="steps">
          <li>{es.discover.step1}</li>
          <li>{es.discover.step2}</li>
          <li>{es.discover.step3}</li>
        </ol>
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

      {/* 11. Cities. */}
      <section className="home-sec">
        <h2>{es.discover.citiesTitle}</h2>
        <div className="city-row">
          {CITIES.map((c) => (
            <Link key={c} className="chip" href={`/buscar?city=${c}`}>{es.cities[c]}</Link>
          ))}
        </div>
      </section>

      {/* 12. Pro recruitment. */}
      <section className="pro-cta">
        <p>{es.discover.proCta}</p>
        <Link className="button" href="/pro/registro">{es.discover.proCtaButton}</Link>
      </section>

      {/* 13. Footer: LegalFooter in the root layout. */}
    </div>
  );
}
