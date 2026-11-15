import type { SupabaseClient } from "@supabase/supabase-js";

/** In-app job check-ins (migration 0063). Client-side reads and RPC writes only. */
export type CheckinKind = "arrival" | "midjob" | "overrun";
export type CheckinAnswer = "yes" | "no" | "ok" | "running" | "finished" | "problem";

export interface JobCheckin {
  id: string;
  job_id: string;
  kind: CheckinKind;
  body: string;
  created_at: string;
  read_at: string | null;
  answer: CheckinAnswer | null;
}

export async function listMyCheckins(supabase: SupabaseClient): Promise<JobCheckin[]> {
  const { data, error } = await supabase
    .from("job_notifications")
    .select("id, job_id, kind, body, created_at, read_at, answer")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as JobCheckin[];
}

export async function answerCheckin(supabase: SupabaseClient, id: string, answer: CheckinAnswer): Promise<void> {
  const { error } = await supabase.rpc("answer_job_checkin", { p_notification: id, p_answer: answer });
  if (error) throw new Error(error.message);
}

export async function markCheckinRead(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.rpc("mark_job_notification_read", { p_notification: id });
  if (error) throw new Error(error.message);
}
