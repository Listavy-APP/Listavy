import type { SupabaseClient } from "@supabase/supabase-js";
import { es } from "@/lib/i18n/es";

export type EmailVerificationBody = { action: "send"; email: string } | { action: "verify"; code: string };

/**
 * Calls the email-verification Edge Function. The function is the only writer of profiles.email.
 * Edge Function errors return a JSON body; its message is surfaced when present.
 */
export async function callEmailVerification(
  supabase: SupabaseClient,
  body: EmailVerificationBody,
): Promise<{ ok?: boolean; email?: string; error?: string }> {
  const { data, error: fnError } = await supabase.functions.invoke("email-verification", { body });
  if (fnError) {
    let msg: string = es.profile.actionFailed;
    try {
      const ctx = (fnError as { context?: Response }).context;
      if (ctx) msg = ((await ctx.json()) as { error?: string }).error ?? msg;
    } catch {
      // keep the generic message
    }
    throw new Error(msg);
  }
  return data as { ok?: boolean; email?: string; error?: string };
}
