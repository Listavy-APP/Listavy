import type { SupabaseClient } from "@supabase/supabase-js";
import { maskAccount, type PayoutDetailsInput } from "@/lib/domain/payout-details";

/** Payout bank details for one pro. Table pro_payout_details (migration 0085): owner-only RLS. */

export type PayoutDetailsSummary = { bankCode: string; branchCode: string | null; accountMasked: string };

/** The signed-in pro's own details, masked. The full account number never leaves the server. */
export async function getPayoutDetails(supabase: SupabaseClient, proId: string): Promise<PayoutDetailsSummary | null> {
  const { data, error } = await supabase
    .from("pro_payout_details")
    .select("bank_code, branch_code, account_number")
    .eq("pro_id", proId)
    .maybeSingle();
  if (error) throw new Error(`No se pudieron leer tus datos bancarios: ${error.message}`);
  if (!data) return null;
  return {
    bankCode: data.bank_code as string,
    branchCode: (data.branch_code as string | null) ?? null,
    accountMasked: maskAccount(data.account_number as string),
  };
}

/** Saves the pro's own row. Insert and update both go through RLS. */
export async function savePayoutDetails(
  supabase: SupabaseClient,
  proId: string,
  value: { bank_code: string; branch_code: string | null; account_number: string },
): Promise<void> {
  const { error } = await supabase.from("pro_payout_details").upsert(
    { pro_id: proId, ...value, updated_at: new Date().toISOString() },
    { onConflict: "pro_id" },
  );
  if (error) throw new Error(error.message);
}

export type { PayoutDetailsInput };
