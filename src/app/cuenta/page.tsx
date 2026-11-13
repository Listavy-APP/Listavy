import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SignOutButton } from "./SignOutButton";
import { PhotoPicker } from "./PhotoPicker";
import { ProfileForm } from "./ProfileForm";
import { EmailForm } from "./EmailForm";
import { DeleteAccount } from "./DeleteAccount";
import { getCurrentProfile } from "@/lib/data/profiles";
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
  return new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" });
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

  const standing = await getClientStanding(supabase);
  const standingNotice = standing.blocked ? (
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
      <h1>{es.profile.title}</h1>
      {standingNotice}
      <p><a href="/avisos">{es.notifications.title}</a></p>

      <h2>{es.profile.photoLabel}</h2>
      <PhotoPicker
        userId={profile.id}
        name={profile.full_name}
        photoUrl={photoUrl}
        photoPath={profile.avatar_path}
      />

      <h2>{es.profile.nameLabel}</h2>
      <ProfileForm userId={profile.id} fullName={profile.full_name} zone={profile.zone} />

      <dl className="details">
        <dt>{es.profile.phoneLabel}</dt>
        <dd>{formatPhoneDisplay(profile.phone)}</dd>
      </dl>
      <p className="muted">{es.profile.phoneHint}</p>

      <h2>{es.profile.emailLabel}</h2>
      <EmailForm current={profile.email} verified={profile.email_verified_at !== null} />

      <h2>{es.profile.tripsTitle}</h2>
      {jobs.length === 0 ? (
        <p className="muted">{es.profile.noTrips}</p>
      ) : (
        <ul className="list">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/trabajos/${j.id}`}>
                <strong>{es.trades[j.trade as keyof typeof es.trades] ?? j.trade}</strong> · {j.zone} · {formatDate(j.created_at)}
              </Link>
              <div className="muted">
                {j.status === "accepted" && j.payment_status === "unpaid"
                  ? es.profile.jobStatusUnpaid
                  : (es.profile.jobStatus[j.status as keyof typeof es.profile.jobStatus] ?? j.status)}
              </div>
            </li>
          ))}
        </ul>
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

      {profile.role === "pro" ? (
        <Link className="button secondary" href="/pro/solicitudes">
          {es.jobs.inboxTitle}
        </Link>
      ) : null}

      <Link className="button secondary" href="/pagos">
        {es.payments.title}
      </Link>

      <h2>{es.profile.proTitle}</h2>
      {profile.role === "pro" ? (
        <Link className="button secondary" href="/pro/estado">
          {es.account.proStatus}
        </Link>
      ) : (
        <Link className="button secondary" href="/pro/registro">
          {es.account.becomePro}
        </Link>
      )}

      <h2>{es.profile.deleteTitle}</h2>
      <DeleteAccount />
      <hr className="account-rule" />
      <SignOutButton />
    </section>
  );
}
