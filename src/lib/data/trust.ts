import type { SupabaseClient } from "@supabase/supabase-js";

/** Trust & safety data access (migration 0075). Every write goes through a security definer function. */

export interface PhotoReportRow {
  id: string;
  job_id: string;
  storage_path: string;
  reason: string;
  status: "pending" | "dismissed" | "upheld";
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
  reporter_name: string | null;
  photo_kind: "request" | "before" | "after" | null;
}

export interface SuspendedClientRow {
  client_id: string;
  reason: string;
  suspended_at: string;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function reportJobPhoto(supabase: SupabaseClient, path: string, reason: string): Promise<void> {
  fail((await supabase.rpc("report_job_photo", { p_path: path, p_reason: reason })).error);
}

export async function listPhotoReports(supabase: SupabaseClient): Promise<PhotoReportRow[]> {
  const { data, error } = await supabase
    .from("job_photo_reports")
    .select(
      "id, job_id, storage_path, reason, status, resolution_note, created_at, resolved_at, " +
        "reporter:profiles!job_photo_reports_reported_by_fkey(full_name), " +
        "photo:job_photos!job_photo_reports_storage_path_fkey(kind)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  type Raw = Omit<PhotoReportRow, "reporter_name" | "photo_kind"> & {
    reporter: { full_name: string | null } | null;
    photo: { kind: PhotoReportRow["photo_kind"] } | { kind: PhotoReportRow["photo_kind"] }[] | null;
  };
  return ((data ?? []) as unknown as Raw[]).map(({ reporter, photo, ...r }) => ({
    ...r,
    reporter_name: reporter?.full_name ?? null,
    photo_kind: (Array.isArray(photo) ? photo[0]?.kind : photo?.kind) ?? null,
  }));
}

export async function resolvePhotoReport(
  supabase: SupabaseClient,
  input: { reportId: string; decision: "dismissed" | "upheld"; note: string },
): Promise<void> {
  fail((await supabase.rpc("admin_resolve_job_photo_report", {
    p_id: input.reportId,
    p_decision: input.decision,
    p_note: input.note,
  })).error);
}

export async function listClientsByName(supabase: SupabaseClient, query: string): Promise<{ id: string; full_name: string | null }[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .neq("role", "admin")
    .ilike("full_name", `%${q.replace(/[%_]/g, "")}%`)
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; full_name: string | null }[];
}

export async function listSuspendedClients(supabase: SupabaseClient): Promise<SuspendedClientRow[]> {
  const { data, error } = await supabase
    .from("client_suspensions")
    .select("client_id, reason, suspended_at, profiles:profiles!client_suspensions_client_id_fkey(full_name)")
    .order("suspended_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SuspendedClientRow[];
}

export async function suspendClient(supabase: SupabaseClient, clientId: string, reason: string): Promise<void> {
  fail((await supabase.rpc("admin_suspend_client", { p_client: clientId, p_reason: reason })).error);
}

export async function unsuspendClient(supabase: SupabaseClient, clientId: string, reason: string): Promise<void> {
  fail((await supabase.rpc("admin_unsuspend_client", { p_client: clientId, p_reason: reason })).error);
}
