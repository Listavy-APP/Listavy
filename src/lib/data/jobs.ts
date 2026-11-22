import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Job flow data access. Every write goes through a security definer function (migration 0011);
 * the database enforces the rules. These wrappers only pass arguments and surface messages.
 */

export const JOB_BUCKET = "job-photos";

export type JobType = "repair" | "diagnostic";

export interface JobRow {
  id: string;
  /** Urgent lane (0117). The fee is the snapshot taken when the job was created. */
  urgent: boolean;
  urgent_fee_dop: number | null;
  homeowner_id: string;
  pro_id: string | null;
  trade: string;
  zone: string;
  description: string;
  status: string;
  job_type: JobType;
  payment_status: string;
  arrived_at: string | null;
  voice_path: string | null;
  location_consent: boolean;
  approved_at: string | null;
  diagnosis_text: string | null;
  pending_difference_dop: number;
  approved_quote_id: string | null;
  scheduled_date: string | null;
  scheduled_window: string | null;
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
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  webm: "audio/webm",
};

export async function uploadJobFile(
  supabase: SupabaseClient,
  uid: string,
  blob: Blob,
  ext: string,
): Promise<string> {
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  // Send a real content type. Some browsers leave File.type empty for .m4a and similar,
  // and playback then depends on the default type the server stores.
  const contentType = blob.type || MIME_BY_EXT[ext.toLowerCase()] || "application/octet-stream";
  const { error } = await supabase.storage
    .from(JOB_BUCKET)
    .upload(path, blob, { upsert: false, contentType });
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

/** Person / company / any. Matches jobs.requested_pro_type (migration 0062). */
export type RequestedType = "individual" | "company" | "any";

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
    requestedProType?: RequestedType;
    /** Both null for "Lo antes posible". Otherwise one date (YYYY-MM-DD) and one window. */
    scheduledDate?: string | null;
    scheduledWindow?: string | null;
    /** Municipality id (0111). The place of the job. */
    municipalityId: string;
    /** Urgent lane (0117). Today only; the fee is snapshotted by the database. */
    urgent?: boolean;
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
    p_requested_pro_type: input.requestedProType ?? "any",
    p_scheduled_date: input.scheduledDate ?? null,
    p_scheduled_window: input.scheduledWindow ?? null,
    p_municipality_id: input.municipalityId,
    p_urgent: input.urgent ?? false,
  });
  fail(error);
  return data as string;
}

/** Client changes the requested date and window. Allowed only while the request is still 'requested'. */
export async function updateJobSchedule(
  supabase: SupabaseClient,
  jobId: string,
  scheduledDate: string | null,
  scheduledWindow: string | null,
): Promise<void> {
  fail((await supabase.rpc("update_job_schedule", { p_job: jobId, p_date: scheduledDate, p_window: scheduledWindow })).error);
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
  const { data, error } = await supabase.rpc("approve_quote", { p_quote: quoteId });
  fail(error);
  // approve_quote returns NULL when the quote has expired (0078). The expired status is saved.
  if (data === null) throw new Error("La cotización venció. Pide una nueva al profesional.");
}

export async function cancelJobRequest(supabase: SupabaseClient, jobId: string): Promise<void> {
  fail((await supabase.rpc("cancel_job_request", { p_job: jobId })).error);
}

/** Cancels a job through cancel_job_with_refund (migration 0076). Money logic lives in the function; the UI only calls it. */
export async function cancelJobWithRefund(
  supabase: SupabaseClient,
  jobId: string,
  by: "homeowner" | "pro",
): Promise<"refund_pending" | "cancelled"> {
  const { data, error } = await supabase.rpc("cancel_job_with_refund", { p_job: jobId, p_by: by });
  fail(error);
  return data === "refund_pending" ? "refund_pending" : "cancelled";
}

export type CancellationPreview =
  | { cancelable: false }
  | { cancelable: true; side: "homeowner" | "pro"; paid_dop: number; fee_dop: number; fee_applies: boolean; refund_dop: number };

export async function getCancellationPreview(supabase: SupabaseClient, jobId: string): Promise<CancellationPreview> {
  const { data, error } = await supabase.rpc("cancellation_preview", { p_job: jobId });
  fail(error);
  return data as CancellationPreview;
}

export async function markArrived(supabase: SupabaseClient, jobId: string): Promise<void> {
  fail((await supabase.rpc("pro_mark_arrived", { p_job: jobId })).error);
}

/** Pro reports the client absent after arrival. Returns the same values as cancel_job_with_refund. */
export async function reportClientNoShow(supabase: SupabaseClient, jobId: string): Promise<"refund_pending" | "cancelled"> {
  const { data, error } = await supabase.rpc("pro_report_client_no_show", { p_job: jobId });
  fail(error);
  return data === "refund_pending" ? "refund_pending" : "cancelled";
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

/** Homeowner's location choice. Stores the flag only, never a location. */
export async function setLocationConsent(supabase: SupabaseClient, jobId: string, allowed: boolean): Promise<void> {
  fail((await supabase.rpc("set_location_consent", { p_job: jobId, p_allowed: allowed })).error);
}
