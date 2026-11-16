import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SignOutButton } from "./SignOutButton";
import { PhotoPicker } from "./PhotoPicker";
import { EmailForm } from "./EmailForm";
import { DeleteAccount } from "./DeleteAccount";
import { ClaimReferral } from "@/components/ClaimReferral";
import { ReferralSection } from "@/components/ReferralSection";
import { referralProgramEnabled } from "@/lib/data/referrals";
import { HashScroll } from "@/components/HashScroll";
import { Icon } from "@/components/Icon";
import { JobCard } from "@/components/JobCard";
import { getCurrentProfile } from "@/lib/data/profiles";
import { getMyPro } from "@/lib/data/pros";
import { listMyJobs, listMyReviews } from "@/lib/data/customer";
import { getClientStanding } from "@/lib/data/standing";
import { customerPhotoUrl } from "@/lib/storage/customerFiles";
import { es } from "@/lib/i18n/es";
import { formatPhoneDisplay } from "@/lib/domain/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.profile.title };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santo_Domingo" });
}

export default async function ProfilePage() {
  // Per-request render: the session and profile are read at request time.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!profile) {
    return (
      <section className="stack">
        <h1>{es.profile.title}</h1>
        <p><a href="/avisos">{es.notifications.title}</a></p>
        <p className="error">{es.account.noProfile}</p>
      </section>
    );
  }

  const [jobs, reviews, photoUrl] = await Promise.all([
    listMyJobs(supabase, profile.id),
    listMyReviews(supabase, profile.id),
    customerPhotoUrl(supabase, profile.avatar_path),
  ]);

  // Dual role: an approved pro who has also requested services sees the client sections too.
  const isPro = profile.role === "pro";
  const clientView = !isPro || jobs.length > 0;
  const myPro = isPro ? await getMyPro(supabase) : null;
  const standing = clientView ? await getClientStanding(supabase) : null;
  const referralEnabled = await referralProgramEnabled(supabase);
  const standingNotice = !standing ? null : standing.blocked ? (
    <div className="panel stack">
      <b>{es.standing.blockedTitle}</b>
      <p>{es.standing.blockedBody}</p>
    </div>
  ) : standing.warning ? (
    <div className="panel stack">
      <b>{es.standing.warningTitle}</b>
      <p>{es.standing.warningBody(standing.low_count)}</p>
    </div>
  ) : null;

  return (
    <section className="stack">
      <div className="page-head">
        <h1 className="sr-only">{es.profile.title}</h1>
        <Link className="gear-btn" href="/ajustes" aria-label={es.settings.title}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
          </svg>
        </Link>
      </div>
      <div className="account-hero">
        <div className="account-banner" aria-hidden="true" />
        <div className="account-avatar">
          <PhotoPicker
            userId={profile.id}
            name={profile.full_name}
            photoUrl={photoUrl}
            photoPath={profile.avatar_path}
            hint={isPro ? es.proHub.photoHint : undefined}
          />
        </div>
        <p className="account-hello">
          {profile.full_name ? es.profile.hello(profile.full_name.split(" ")[0]) : es.profile.helloFallback}
        </p>
      </div>
      {standingNotice}
      {clientView ? <ClaimReferral track="client" /> : null}


      <div className="hub-group">
      <Link className="contact-row" href="/cuenta/perfil">
        <span className="icon-box"><Icon name="user" /></span>
        <span className="contact-label">{es.profile.editProfile}</span>
        <span className="contact-value">{profile.full_name ?? "—"}</span>
      </Link>

      <Link className="contact-row" href="/cuenta/telefono">
        <span className="icon-box"><Icon name="phone" /></span>
        <span className="contact-label">{es.profile.phoneLabel}</span>
        <span className="contact-value">{formatPhoneDisplay(profile.phone)}</span>
      </Link>

      <details className="contact-row">
        <summary>
          <span className="icon-box"><Icon name="mail" /></span>
          <span className="contact-label">{es.profile.emailLabel}</span>
          <span className="contact-value">{profile.email ?? "—"}</span>
        </summary>
        <EmailForm current={profile.email} verified={profile.email_verified_at !== null} />
      </details>

      <Link className="contact-row" href="/cuenta/guardados">
        <span className="icon-box"><Icon name="heart" /></span>
        <span className="contact-label">{es.saved.title}</span>
      </Link>

      {clientView ? (
        <Link className="contact-row" href="/cuenta/direcciones">
          <span className="icon-box"><Icon name="home" /></span>
          <span className="contact-label">{es.addresses.title}</span>
        </Link>
      ) : null}

      <Link className="contact-row" href="/ayuda">
        <span className="icon-box"><Icon name="help" /></span>
        <span className="contact-label">{es.help.title}</span>
      </Link>

      {profile.role === "admin" ? (
        <Link className="contact-row" href="/admin">
          <span className="icon-box"><Icon name="shield" /></span>
          <span className="contact-label">{es.account.adminLink}</span>
        </Link>
      ) : null}

      </div>
      <div className="hub-band" />
      {isPro ? (
        <div className="hub-group">
          <h2>{es.proHub.title}</h2>
          <Link className="contact-row" href="/pro/solicitudes">
            <span className="contact-label">{es.proHub.requests}</span>
          </Link>
          <Link className="contact-row" href="/trabajos">
            <span className="contact-label">{es.proHub.jobs}</span>
          </Link>
          <Link className="contact-row" href="/pro/pagos">
            <span className="contact-label">{es.proHub.payouts}</span>
          </Link>
          {myPro?.verification_status === "approved" ? (
            <Link className="contact-row" href={`/pro/${myPro.id}`}>
              <span className="contact-label">{es.proHub.publicProfile}</span>
            </Link>
          ) : null}
          <Link className="contact-row" href="/buscar">
            <span className="contact-label">{es.proHub.requestService}</span>
          </Link>
          <Link className="contact-row" href="/pro/estado">
            <span className="contact-label">{es.proHub.availability}</span>
          </Link>
          <Link className="contact-row" href="/pro/estado">
            <span className="contact-label">{es.account.proStatus}</span>
          </Link>
        </div>
      ) : null}
      {clientView ? (
      <div className="hub-group">
      <h2>{es.profile.tripsTitle}</h2>
      {jobs.length === 0 ? (
        <p className="muted">{es.profile.noTrips}</p>
      ) : (
        <div className="cards">
          {jobs.map((j) => (
            <JobCard
              key={j.id}
              href={`/trabajos/${j.id}`}
              title={es.trades[j.trade as keyof typeof es.trades] ?? j.trade}
              proName={j.pros?.profiles?.full_name ?? null}
              zone={j.zone}
              dateLabel={formatDate(j.created_at)}
              statusLabel={
                j.status === "accepted" && j.payment_status === "unpaid"
                  ? es.profile.jobStatusUnpaid
                  : (es.profile.jobStatus[j.status as keyof typeof es.profile.jobStatus] ?? j.status)
              }
              amountDop={j.approved_quote?.amount_dop ?? null}
              noProLabel={es.profile.jobProFallback}
            />
          ))}
        </div>
      )}

      <h2>{es.profile.reviewsTitle}</h2>
      {reviews.length === 0 ? (
        <p className="muted">{es.profile.noReviews}</p>
      ) : (
        <ul className="list">
          {reviews.map((r) => (
            <li key={r.id}>
              <strong>{r.pro_name ?? "—"}</strong> · {"★".repeat(r.rating)}
              {r.comment ? <div className="muted">{r.comment}</div> : null}
            </li>
          ))}
        </ul>
      )}

      </div>
      ) : null}
      <div className="hub-band" />
      <div className="hub-group">

      {referralEnabled ? <ReferralSection supabase={supabase} uid={profile.id} role={profile.role} /> : null}

      {!isPro ? (
        <>
          <h2>{es.profile.proTitle}</h2>
          <Link className="button secondary" href="/pro/registro">
            {es.account.becomePro}
          </Link>
        </>
      ) : null}

      </div>
      <div className="hub-band" />
      <div className="hub-group">
      <hr className="account-rule" />
      <SignOutButton />
      <h2 id="eliminar">{es.profile.deleteTitle}</h2>
      <DeleteAccount />
      </div>
      <HashScroll id="eliminar" />
    </section>
  );
}
