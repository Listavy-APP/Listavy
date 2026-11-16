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

export async function openDispute(
  supabase: SupabaseClient,
  input: { jobId: string; latent: boolean; reason: string },
): Promise<void> {
  fail((await supabase.rpc("open_dispute", { p_job: input.jobId, p_latent: input.latent, p_reason: input.reason })).error);
}

export async function submitEvidence(supabase: SupabaseClient, disputeId: string, statement: string): Promise<void> {
  fail((await supabase.rpc("submit_dispute_evidence", { p_dispute: disputeId, p_statement: statement })).error);
}

export interface NotificationRow {
  id: string;
  kind: "notice" | "reminder" | "decision" | "recovery_request";
  body: string;
  created_at: string;
  /** Job the notice is about (via its dispute). Null if the dispute is gone. */
  job_id: string | null;
}

export async function listMyNotifications(supabase: SupabaseClient): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("dispute_notifications")
    .select("id, kind, body, created_at, disputes(job_id)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  // To-one embed comes back as an object at runtime; the generated types may read it as an array.
  type Raw = Omit<NotificationRow, "job_id"> & { disputes: { job_id: string } | { job_id: string }[] | null };
  return ((data ?? []) as unknown as Raw[]).map((n) => {
    const d = Array.isArray(n.disputes) ? n.disputes[0] : n.disputes;
    return { id: n.id, kind: n.kind, body: n.body, created_at: n.created_at, job_id: d?.job_id ?? null };
  });
}

export async function listJobDisputes(supabase: SupabaseClient, jobId: string): Promise<DisputeRow[]> {
  const { data, error } = await supabase
    .from("disputes")
    .select("id, job_id, opened_side, phase, latent_defect, reason, stage, status, outcome, refund_dop, opened_at, evidence_due_at, decided_at, decision_reason, payments(amount_dop, status)")
    .eq("job_id", jobId)
    .order("opened_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DisputeRow[];
}

// ---------------------------------------------------------------------------
// Dispute photo evidence (migration 0075). Bucket: dispute-evidence (private).
// ---------------------------------------------------------------------------

export const DISPUTE_PHOTO_BUCKET = "dispute-evidence";
export const DISPUTE_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const DISPUTE_PHOTO_MAX_PER_AUTHOR = 6;

export interface DisputePhotoRow {
  id: string;
  dispute_id: string;
  author_id: string;
  side: "homeowner" | "pro";
  storage_path: string;
  created_at: string;
}

const PHOTO_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function listDisputePhotos(supabase: SupabaseClient, disputeIds: string[]): Promise<DisputePhotoRow[]> {
  if (disputeIds.length === 0) return [];
  const { data, error } = await supabase
    .from("dispute_evidence_photos")
    .select("id, dispute_id, author_id, side, storage_path, created_at")
    .in("dispute_id", disputeIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DisputePhotoRow[];
}

/** Uploads one photo into the caller's folder for this dispute. Returns the storage path. */
export async function uploadDisputePhoto(
  supabase: SupabaseClient,
  uid: string,
  disputeId: string,
  file: File,
): Promise<string> {
  const ext = PHOTO_EXT[file.type];
  if (!ext) throw new Error("Usa una foto en JPG, PNG o WebP.");
  if (file.size > DISPUTE_PHOTO_MAX_BYTES) throw new Error("La foto supera 8 MB.");
  const path = `${uid}/${disputeId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(DISPUTE_PHOTO_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(`No se pudo subir la foto: ${error.message}`);
  return path;
}

export async function registerDisputePhoto(supabase: SupabaseClient, disputeId: string, path: string): Promise<void> {
  fail((await supabase.rpc("submit_dispute_photo", { p_dispute: disputeId, p_path: path })).error);
}

/** Short-lived link for a dispute photo. The storage policy decides who may read it. */
export async function disputePhotoUrl(supabase: SupabaseClient, path: string, seconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(DISPUTE_PHOTO_BUCKET).createSignedUrl(path, seconds);
  if (error) return null;
  return data.signedUrl;
}
