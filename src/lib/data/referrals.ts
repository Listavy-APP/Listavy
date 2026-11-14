import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data access for the referral promo (Invita y gana). UI code calls these, never raw queries.
 * Writes go through security definer functions (migration 0040). RLS limits reads to the party
 * to each referral and to admins.
 */

export type ReferralTrack = "client" | "pro";

export type MyReferral = {
  id: string;
  track: ReferralTrack;
  status: "pending" | "granted" | "revoked";
  created_at: string;
  granted_at: string | null;
  revoked_reason: string | null;
};

export type MyCredit = {
  id: string;
  amount_dop: number;
  expires_at: string;
};

export type AdminReferral = MyReferral & {
  referrer_id: string;
  referee_id: string;
  referrer_name: string | null;
  referee_name: string | null;
  revoked_at: string | null;
  referee_pro_free_at: string | null;
  discount_used_at: string | null;
};

/** Whether the program is on. Off by default (migration 0040). */
export async function referralProgramEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("referral_program_enabled");
  if (error) return false;
  return data === true;
}

/** The signed-in user's own code. Created on first request. */
export async function getMyReferralCode(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_my_referral_code");
  if (error) return null;
  return typeof data === "string" ? data : null;
}

/** Claims a referral code for the signed-in account. Throws with the database message on refusal. */
export async function claimReferral(supabase: SupabaseClient, code: string, track: ReferralTrack): Promise<void> {
  const { error } = await supabase.rpc("claim_referral", { p_code: code, p_track: track });
  if (error) throw new Error(error.message);
}

/** Referrals made by the signed-in user. */
export async function listMyReferrals(supabase: SupabaseClient, uid: string): Promise<MyReferral[]> {
  const { data, error } = await supabase
    .from("referrals")
    .select("id, track, status, created_at, granted_at, revoked_reason")
    .eq("referrer_id", uid)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`No se pudieron cargar tus referidos: ${error.message}`);
  return (data ?? []) as MyReferral[];
}

/** Unused, unexpired credits of the signed-in user. */
export async function listMyCredits(supabase: SupabaseClient, uid: string): Promise<MyCredit[]> {
  const { data, error } = await supabase
    .from("client_credits")
    .select("id, amount_dop, expires_at")
    .eq("profile_id", uid)
    .eq("status", "granted")
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true });
  if (error) throw new Error(`No se pudo cargar tu crédito: ${error.message}`);
  return (data ?? []) as MyCredit[];
}

/** All referrals with names, for the admin view. RLS allows admins only. */
export async function listAdminReferrals(supabase: SupabaseClient): Promise<AdminReferral[]> {
  const { data, error } = await supabase
    .from("referrals")
    .select(
      "id, track, status, created_at, granted_at, revoked_at, revoked_reason, referrer_id, referee_id, referee_pro_free_at, discount_used_at, referrer:profiles!referrer_id(full_name), referee:profiles!referee_id(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`No se pudieron cargar los referidos: ${error.message}`);
  type Row = Omit<AdminReferral, "referrer_name" | "referee_name"> & {
    referrer: { full_name: string | null } | null;
    referee: { full_name: string | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map(({ referrer, referee, ...r }) => ({
    ...r,
    referrer_name: referrer?.full_name ?? null,
    referee_name: referee?.full_name ?? null,
  }));
}

/** Admin only. Revokes a referral with a reason. Clears unused credits. */
export async function revokeReferral(supabase: SupabaseClient, id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_revoke_referral", { p_referral: id, p_reason: reason });
  if (error) throw new Error(error.message);
}
