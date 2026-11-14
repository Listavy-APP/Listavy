import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/data/profiles";
import { listAdminReferrals, type AdminReferral } from "@/lib/data/referrals";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../AdminNav";
import { RevokeReferralButton } from "./RevokeReferralButton";

export const metadata = { title: es.referral.admin.title };

// Session-dependent page: read at request time, never cached.
export const instant = false;

function dateOnly(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santo_Domingo" });
}

function statusText(r: AdminReferral): string {
  if (r.status === "revoked") return `${es.referral.admin.revokedAt} ${dateOnly(r.revoked_at)}`;
  if (r.status === "granted") return es.referral.statusGranted;
  return es.referral.statusPending;
}

export default async function AdminReferralsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const rows = await listAdminReferrals(supabase);

  return (
    <section className="stack">
      <AdminNav current="/admin/referidos" />
      <h1>{es.referral.admin.title}</h1>
      <p className="muted">{es.referral.admin.subtitle}</p>

      {rows.length === 0 ? (
        <p className="muted">{es.referral.admin.empty}</p>
      ) : (
        <ul className="stack">
          {rows.map((r) => (
            <li key={r.id} className="panel stack">
              <b>
                {r.referrer_name ?? "—"} → {r.referee_name ?? "—"}
              </b>
              <span className="muted">
                {es.referral.admin.columns.track}: {es.referral.admin.tracks[r.track]} · {es.referral.admin.columns.date}: {dateOnly(r.created_at)}
              </span>
              <span>{statusText(r)}</span>
              {r.status === "granted" && r.track === "pro" && r.referee_pro_free_at ? (
                <span className="muted">{es.referral.admin.proFreeNote}</span>
              ) : null}
              {r.revoked_reason ? <span className="muted">{r.revoked_reason}</span> : null}
              {r.status !== "revoked" ? <RevokeReferralButton referralId={r.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
