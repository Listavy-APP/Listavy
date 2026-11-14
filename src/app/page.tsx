import Link from "next/link";
import { connection } from "next/server";
import { es } from "@/lib/i18n/es";
import { TRADES } from "@/lib/domain/catalog";
import { getMyReferralCode, referralProgramEnabled } from "@/lib/data/referrals";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Session-dependent: the referral banner shows the signed-in user's code.
export const instant = false;

const CAT_PHOTO: Record<(typeof TRADES)[number], string> = {
  plumber: "/categories/plomero.jpg",
  electrician: "/categories/electricista.jpg",
  ac_technician: "/categories/aire-acondicionado.jpg",
};

export default async function HomePage() {
  // Read the session and the referral flag at request time.
  await connection();
  const supabase = await createSupabaseServerClient();
  const referralOn = await referralProgramEnabled(supabase);
  const { data: userData } = await supabase.auth.getUser();
  const code = referralOn && userData.user ? await getMyReferralCode(supabase) : null;

  return (
    <section className="stack hero">
      <p className="eyebrow">{es.home.eyebrow}</p>
      <h1>{es.home.title}</h1>
      <p className="lead">{es.home.subtitle}</p>

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

      <Link className="search-bar" href="/buscar">
        {es.home.searchPlaceholder}
      </Link>

      <div className="sec-title">
        <span>{es.home.servicesTitle}</span>
        <Link href="/buscar">{es.home.seeAll}</Link>
      </div>
      <div className="cats">
        {TRADES.map((t) => (
          <Link key={t} className="cat" href={`/buscar?trade=${t}`}>
            {/* Representative category photo, not a specific pro. Label text carries the meaning. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="cat-photo" src={CAT_PHOTO[t]} alt="" loading="lazy" />
            <span className="cat-name">{es.trades[t]}</span>
          </Link>
        ))}
      </div>

      <div className="actions">
        <Link className="button" href="/login">
          {es.home.loginCta}
        </Link>
      </div>

    </section>
  );
}
