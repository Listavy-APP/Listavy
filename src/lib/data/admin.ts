import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read-only data for the admin payout view. Admin RLS applies (is_admin()).
 * Writes happen only in service-role functions. Keep all table access in src/lib/data/.
 */

export type AdminPayment = {
  id: string;
  job_id: string;
  purpose: string;
  status: "pending" | "held" | "released" | "refunded" | "disputed";
  amount_minor: number;
  amount_dop: number;
  commission_dop: number;
  pro_payout_dop: number;
  keep_dop: number | null;
  keep_commission_dop: number | null;
  keep_pro_payout_dop: number | null;
  refunded_minor: number;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  release_after: string | null;
  released_at: string | null;
  created_at: string;
  recovery_netted_dop: number;
};

export type AdminDeduction = {
  id: string;
  payment_id: string;
  recovery_id: string;
  amount_dop: number;
  created_at: string;
  reversed_at: string | null;
};

export type OwedRecovery = {
  id: string;
  pro_id: string;
  pro_name: string | null;
  dispute_id: string;
  amount_dop: number;
  settled_dop: number;
  created_at: string;
};

const PAYMENT_COLUMNS =
  "id, job_id, purpose, status, amount_minor, amount_dop, commission_dop, pro_payout_dop, keep_dop, keep_commission_dop, keep_pro_payout_dop, refunded_minor, stripe_payment_intent_id, stripe_transfer_id, release_after, released_at, created_at, recovery_netted_dop";

export async function listAdminPayments(supabase: SupabaseClient, limit = 100): Promise<AdminPayment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .order("release_after", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`No se pudieron leer los pagos: ${error.message}`);
  return (data ?? []) as AdminPayment[];
}

/** Funding minus draws, in RD$. Reads the full ledger; the table is small in v1. */
export async function getReserveBalance(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.from("guarantee_reserve").select("entry_kind, amount_dop");
  if (error) throw new Error(`No se pudo leer la reserva: ${error.message}`);
  return (data ?? []).reduce(
    (sum, row) => sum + (row.entry_kind === "funding" ? row.amount_dop : -row.amount_dop),
    0,
  );
}

export async function listOwedRecoveries(supabase: SupabaseClient): Promise<OwedRecovery[]> {
  const { data, error } = await supabase
    .from("pro_recoveries")
    .select("id, pro_id, dispute_id, amount_dop, settled_dop, created_at")
    .eq("status", "owed")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron leer las deudas: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.pro_id))];
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  if (profileError) throw new Error(`No se pudieron leer los nombres: ${profileError.message}`);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string | null]));

  return rows.map((r) => ({
    id: r.id,
    pro_id: r.pro_id,
    pro_name: names.get(r.pro_id) ?? null,
    dispute_id: r.dispute_id,
    amount_dop: r.amount_dop,
    settled_dop: r.settled_dop,
    created_at: r.created_at,
  }));
}

/** Every debt deduction from a payout, newest first. Each row records one debt touched by one payment. */
export async function listDeductions(supabase: SupabaseClient, limit = 100): Promise<AdminDeduction[]> {
  const { data, error } = await supabase
    .from("recovery_deductions")
    .select("id, payment_id, recovery_id, amount_dop, created_at, reversed_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`No se pudieron leer las deducciones: ${error.message}`);
  return (data ?? []) as AdminDeduction[];
}
