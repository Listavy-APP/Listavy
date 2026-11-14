import type { SupabaseClient } from "@supabase/supabase-js";
import { getMyReferralCode, listMyCredits, listMyReferrals, type MyReferral } from "@/lib/data/referrals";
import { es } from "@/lib/i18n/es";
import { ReferralShare } from "./ReferralShare";

function dateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santo_Domingo" });
}

function statusLabel(r: MyReferral): string {
  if (r.status === "revoked") return es.referral.statusRevoked;
  if (r.status === "granted") return es.referral.statusGranted;
  return es.referral.statusPending;
}

/** "Invita y gana" block for /cuenta. The caller checks the program flag first. */
export async function ReferralSection({
  supabase,
  uid,
  role,
}: {
  supabase: SupabaseClient;
  uid: string;
  role: string;
}) {
  const code = await getMyReferralCode(supabase);
  if (!code) return null;
  const track = role === "pro" ? "pro" : "client";
  const [referrals, credits] = await Promise.all([listMyReferrals(supabase, uid), listMyCredits(supabase, uid)]);

  return (
    <section className="stack">
      <h2>{es.referral.sectionTitle}</h2>
      <p>{track === "pro" ? es.referral.proIntro : es.referral.clientIntro}</p>
      <ReferralShare code={code} track={track} />
      <p className="muted">{track === "pro" ? es.referral.proTerms : es.referral.clientTerms}</p>

      <h3>{es.referral.creditTitle}</h3>
      {credits.length === 0 ? (
        <p className="muted">{es.referral.noCredit}</p>
      ) : (
        credits.map((c) => (
          <p key={c.id}>{es.referral.creditLine(c.amount_dop, dateOnly(c.expires_at))}</p>
        ))
      )}

      <h3>{es.referral.referralsTitle}</h3>
      {referrals.length === 0 ? (
        <p className="muted">{es.referral.noReferrals}</p>
      ) : (
        <ul className="stack">
          {referrals.map((r) => (
            <li key={r.id}>
              {statusLabel(r)} · {dateOnly(r.created_at)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
