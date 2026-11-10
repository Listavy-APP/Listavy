import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phone sign-in with a one-time code delivered over SMS (Twilio Verify).
 * Requires the Twilio Verify provider enabled in Supabase Auth (see README).
 * WhatsApp delivery is deferred until the Meta sender is approved.
 * Phone numbers must be E.164, for example +18095551234.
 */

const E164 = /^\+[1-9]\d{7,14}$/;

export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s()-]/g, "");
  return E164.test(compact) ? compact : null;
}

export async function sendWhatsAppCode(supabase: SupabaseClient, phone: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { channel: "sms" },
  });
  if (error) throw error;
}

export async function verifyWhatsAppCode(
  supabase: SupabaseClient,
  phone: string,
  token: string,
): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) throw error;
}

export async function signOut(supabase: SupabaseClient): Promise<void> {
  await supabase.auth.signOut();
}
