import type { SupabaseClient } from "@supabase/supabase-js";
import { getMyReferralCode, referralProgramEnabled } from "@/lib/data/referrals";
import { es } from "@/lib/i18n/es";
import { ReferralShare } from "./ReferralShare";

/** Shown to a homeowner on a completed job. Renders nothing while the program is off. */
export async function ReferralPrompt({ supabase }: { supabase: SupabaseClient }) {
  if (!(await referralProgramEnabled(supabase))) return null;
  const code = await getMyReferralCode(supabase);
  if (!code) return null;
  return (
    <section className="panel stack">
      <h2>{es.referral.promptTitle}</h2>
      <ReferralShare code={code} track="client" />
    </section>
  );
}
