import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Job flow data access. Every write goes through a security definer function (migration 0011);
 * the database enforces the rules. These wrappers only pass arguments and surface messages.
 */

export const JOB_BUCKET = "job-photos";

export type JobType = "repair" | "diagnostic";

export interface JobRow {
  id: string;
  homeowner_id: string;
  pro_id: string | null;
  trade: string;
  zone: string;
  description: string;
  status: string;
  job_type: JobType;
  payment_status: string;
  voice_path: string | null;
  diagnosis_text: string | null;
  pending_difference_dop: number;
  approved_quote_id: string | null;
  credit_from_job_id: string | null;
  fx_rate_dop_per_usd: number | string;
  created_at: string;
}

export interface QuoteRow {
  id: string;
  job_id: string;
  pro_id: string;
  status: string;
  amount_dop: number | null;
  includes: string | null;
  excludes: string | null;
  materials_included: boolean | null;
  window_start: string | null;
  window_end: string | null;
  duration_hours: number | null;
  invited_at: string;
  valid_until: string | null;
  revision_of: string | null;
  revision_reason: string | null;
}

export interface JobPhotoRow {
  id: string;
  kind: "request" | "before" | "after";
  storage_path: string;
}

/** Upload a file under <uid>/<uuid>.<ext>. Returns the object path. */
export async function uploadJobFile(
  supabase: SupabaseClient,
  uid: string,
  blob: Blob,
  ext: string,
): Promise<string> {
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(JOB_BUCKET).upload(path, blob, { upsert: false });
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
  return path;
}

/** Short-lived link for a job file the caller may read. RLS (can_view_job_photo) decides. */
export async function jobFileUrl(supabase: SupabaseClient, path: string, seconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(JOB_BUCKET).createSignedUrl(path, seconds);
  if (error) return null;
  return data.signedUrl;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function createJobRequest(
  supabase: SupabaseClient,
  input: {
    trade: string;
    zone: string;
    description: string;
    jobType: JobType;
    proIds: string[];
    photoPaths: string[];
    voicePath: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc("create_job_request", {
    p_trade: input.trade,
    p_zone: input.zone,
    p_description: input.description,
    p_job_type: input.jobType,
    p_pro_ids: input.proIds,
    p_photo_paths: input.photoPaths,
    p_voice_path: input.voicePath,
  });
  fail(error);
  return data as string;
}

export async function declineInvite(supabase: SupabaseClient, quoteId: string): Promise<void> {
  fail((await supabase.rpc("decline_invite", { p_quote: quoteId })).error);
}

export async function submitQuote(
  supabase: SupabaseClient,
  quoteId: string,
  input: {
    amountDop: number;
    includes: string;
    excludes: string;
    materialsIncluded: boolean;
    windowStart: string;
    windowEnd: string;
    durationHours: number;
  },
): Promise<void> {
  fail(
    (
      await supabase.rpc("submit_quote", {
        p_quote: quoteId,
        p_amount_dop: input.amountDop,
        p_includes: input.includes,
        p_excludes: input.excludes,
        p_materials_included: input.materialsIncluded,
        p_window_start: input.windowStart,
        p_window_end: input.windowEnd,
        p_duration_hours: input.durationHours,
      })
    ).error,
  );
}

export async function approveQuote(supabase: SupabaseClient, quoteId: string): Promise<void> {
  fail((await supabase.rpc("approve_quote", { p_quote: quoteId })).error);
}

export async function cancelJobRequest(supabase: SupabaseClient, jobId: string): Promise<void> {
  fail((await supabase.rpc("cancel_job_request", { p_job: jobId })).error);
}

export async function addJobPhoto(
  supabase: SupabaseClient,
  jobId: string,
  kind: "before" | "after",
  path: string,
): Promise<void> {
  fail((await supabase.rpc("add_job_photo", { p_job: jobId, p_kind: kind, p_path: path })).error);
}

export async function startJob(supabase: SupabaseClient, jobId: string): Promise<void> {
  fail((await supabase.rpc("start_job", { p_job: jobId })).error);
}

export async function getCompletionCode(supabase: SupabaseClient, jobId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_completion_code", { p_job: jobId });
  if (error) return null;
  return (data as string | null) ?? null;
}

export async function submitCloseout(supabase: SupabaseClient, jobId: string, diagnosis?: string): Promise<void> {
  fail((await supabase.rpc("submit_closeout", { p_job: jobId, p_diagnosis: diagnosis ?? null })).error);
}

export async function approveCloseout(supabase: SupabaseClient, jobId: string, code?: string): Promise<void> {
  fail((await supabase.rpc("approve_closeout", { p_job: jobId, p_code: code ?? null })).error);
}

export async function getContactPhone(supabase: SupabaseClient, jobId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_contact", { p_job: jobId });
  if (error) return null;
  return (data as string | null) ?? null;
}

export async function proposeRevision(
  supabase: SupabaseClient,
  jobId: string,
  input: {
    amountDop: number;
    includes: string;
    excludes: string;
    materialsIncluded: boolean;
    windowStart: string;
    windowEnd: string;
    durationHours: number;
    reason: string;
  },
): Promise<void> {
  fail(
    (
      await supabase.rpc("propose_revision", {
        p_job: jobId,
        p_amount_dop: input.amountDop,
        p_includes: input.includes,
        p_excludes: input.excludes,
        p_materials_included: input.materialsIncluded,
        p_window_start: input.windowStart,
        p_window_end: input.windowEnd,
        p_duration_hours: input.durationHours,
        p_reason: input.reason,
      })
    ).error,
  );
}

export async function approveRevision(supabase: SupabaseClient, quoteId: string): Promise<void> {
  fail((await supabase.rpc("approve_revision", { p_quote: quoteId })).error);
}
