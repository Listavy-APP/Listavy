import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentStage, Stage } from "@/lib/domain/verification";

/** Data access for the B1 verification ladder. UI calls these; SQL lives in 0074. */

export type VerificationRow = {
  id: string;
  pro_id: string;
  stage: Stage;
  storage_path: string | null;
  status: "pending" | "approved" | "rejected";
  issue_date: string | null;
  expires_at: string | null;
  verified_at: string | null;
  reason: string | null;
  created_at: string;
};

const ROW_COLUMNS = "id, pro_id, stage, storage_path, status, issue_date, expires_at, verified_at, reason, created_at";

/** The signed-in pro's own rows, newest first. RLS limits this to their rows. */
export async function listMyVerifications(supabase: SupabaseClient, proId: string): Promise<VerificationRow[]> {
  const { data, error } = await supabase
    .from("pro_verifications")
    .select(ROW_COLUMNS)
    .eq("pro_id", proId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudo leer tu verificación: ${error.message}`);
  return (data ?? []) as VerificationRow[];
}

/** Public badge source: approved, unexpired stages only. Safe for any viewer. */
export async function currentVerifications(supabase: SupabaseClient, proId: string): Promise<CurrentStage[]> {
  const { data, error } = await supabase.rpc("pro_current_verifications", { p_pro: proId });
  if (error) return [];
  return (data ?? []) as CurrentStage[];
}

/** Admin queue: every pending row, oldest first, with the pro's name. RLS: admins only. */
export async function listPendingVerifications(
  supabase: SupabaseClient,
): Promise<(VerificationRow & { pro_name: string | null })[]> {
  const { data, error } = await supabase
    .from("pro_verifications")
    .select(`${ROW_COLUMNS}, pros:pros!pro_verifications_pro_id_fkey(profiles:profiles!pros_id_fkey(full_name))`)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron leer las verificaciones: ${error.message}`);
  type Raw = VerificationRow & { pros: { profiles: { full_name: string | null } | null } | null };
  return ((data ?? []) as unknown as Raw[]).map(({ pros, ...r }) => ({ ...r, pro_name: pros?.profiles?.full_name ?? null }));
}

export type SubmitInput = {
  proId: string;
  stage: Stage;
  file: Blob;
  contentType: "image/jpeg" | "application/pdf";
  issueDate: string | null;
  expiresAt: string | null;
  consentVersion: string;
};

/**
 * Uploads a document to the private pro-documents bucket and inserts a pending row.
 * Storage path is <proId>/<uuid>.<ext>, the same layout the existing policy allows.
 */
export async function submitVerification(supabase: SupabaseClient, input: SubmitInput): Promise<void> {
  const ext = input.contentType === "application/pdf" ? "pdf" : "jpg";
  const path = `${input.proId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("pro-documents").upload(path, input.file, {
    contentType: input.contentType,
    upsert: false,
  });
  if (upErr) throw upErr;

  const { error } = await supabase.from("pro_verifications").insert({
    pro_id: input.proId,
    stage: input.stage,
    storage_path: path,
    status: "pending",
    issue_date: input.issueDate,
    expires_at: input.expiresAt,
    consent_version: input.consentVersion,
  });
  if (error) throw error;
}

export type ReviewInput =
  | { id: string; decision: "rejected"; reason: string }
  | { id: string; decision: "approved"; issueDate: string | null; expiresAt: string | null };

/** Approve or reject one row through the RPC. The RPC enforces the stage rules and writes the Bitácora. */
export async function reviewVerification(supabase: SupabaseClient, input: ReviewInput): Promise<void> {
  const args =
    input.decision === "rejected"
      ? { p_id: input.id, p_decision: "rejected", p_reason: input.reason }
      : { p_id: input.id, p_decision: "approved", p_issue_date: input.issueDate, p_expires_at: input.expiresAt };
  const { error } = await supabase.rpc("admin_review_verification", args);
  if (error) throw new Error(error.message);
}
