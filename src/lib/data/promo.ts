import type { SupabaseClient } from "@supabase/supabase-js";

/** Admin data access for promo codes (0095). Every function checks is_admin() in the database. */

export type AdminPromoCode = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  starts_at: string | null;
  expires_at: string | null;
  max_redemptions: number | null;
  active: boolean;
  note: string | null;
  created_at: string;
  redeemed_count: number;
  reserved_count: number;
};

export type PromoInput = {
  code: string;
  kind: "percent" | "fixed";
  value: number;
  startsAt: string | null;
  expiresAt: string | null;
  maxRedemptions: number | null;
  note: string | null;
};

export async function listPromoCodes(supabase: SupabaseClient): Promise<AdminPromoCode[]> {
  const { data, error } = await supabase.rpc("admin_list_promo_codes");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminPromoCode[];
}

export async function createPromoCode(supabase: SupabaseClient, input: PromoInput): Promise<void> {
  const { error } = await supabase.rpc("admin_create_promo_code", {
    p_code: input.code,
    p_kind: input.kind,
    p_value: input.value,
    p_starts_at: input.startsAt,
    p_expires_at: input.expiresAt,
    p_max_redemptions: input.maxRedemptions,
    p_note: input.note,
  });
  if (error) throw new Error(error.message);
}

export async function setPromoActive(supabase: SupabaseClient, id: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc("admin_set_promo_active", { p_id: id, p_active: active });
  if (error) throw new Error(error.message);
}
