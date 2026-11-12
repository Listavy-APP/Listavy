import type { SupabaseClient } from "@supabase/supabase-js";

/** Mediation desk data access. Every write goes through a security definer function (migration 0027). */

export type DisputeStage = "filed" | "evidence" | "decided" | "executed" | "closed";
export type DisputeOutcome = "release_full" | "partial_refund" | "full_refund" | "redo";

export interface DisputeRow {
  id: string;
  job_id: string;
  opened_side: "homeowner" | "pro";
  phase: "pre_release" | "post_release";
  latent_defect: boolean;
  reason: string;
  stage: DisputeStage;
  status: string;
  outcome: DisputeOutcome | null;
  refund_dop: number | null;
  opened_at: string;
  evidence_due_at: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  payments: { amount_dop: number | null; status: string } | null;
}

export interface EvidenceRow {
  dispute_id: string;
  side: "homeowner" | "pro";
  statement: string;
  created_at: string;
}

export async function listAdminDisputes(supabase: SupabaseClient): Promise<DisputeRow[]> {
  const { data, error } = await supabase
    .from("disputes")
    .select("id, job_id, opened_side, phase, latent_defect, reason, stage, status, outcome, refund_dop, opened_at, evidence_due_at, decided_at, decision_reason, payments(amount_dop, status)")
    .order("opened_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DisputeRow[];
}

export async function listEvidence(supabase: SupabaseClient, disputeIds: string[]): Promise<EvidenceRow[]> {
  if (disputeIds.length === 0) return [];
  const { data, error } = await supabase
    .from("dispute_evidence")
    .select("dispute_id, side, statement, created_at")
    .in("dispute_id", disputeIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EvidenceRow[];
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function decideDispute(
  supabase: SupabaseClient,
  input: { disputeId: string; outcome: DisputeOutcome; refundDop: number | null; reason: string },
): Promise<void> {
  fail((await supabase.rpc("resolve_dispute", {
    p_dispute: input.disputeId,
    p_outcome: input.outcome,
    p_refund_dop: input.refundDop,
    p_reason: input.reason,
  })).error);
}

export async function closeDispute(supabase: SupabaseClient, disputeId: string): Promise<void> {
  fail((await supabase.rpc("close_dispute", { p_dispute: disputeId })).error);
}

export async function finishRedo(supabase: SupabaseClient, disputeId: string): Promise<void> {
  fail((await supabase.rpc("finish_redo_dispute", { p_dispute: disputeId })).error);
}
