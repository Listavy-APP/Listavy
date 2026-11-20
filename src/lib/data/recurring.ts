import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecurringFrequency, RecurringStatus } from "@/lib/domain/recurring";

/** Recurring bookings (0096). Clients read their own series; every write goes through a definer. */

export type RecurringRow = {
  id: string;
  source_job_id: string;
  trade: string;
  zone: string;
  frequency: RecurringFrequency;
  anchor: number;
  scheduled_window: "morning" | "afternoon" | "evening";
  status: RecurringStatus;
  paused_reason: "pro_unavailable" | "client_suspended" | null;
  next_due_date: string;
  occurrences: number;
  pro_name: string | null;
};

type Raw = Omit<RecurringRow, "pro_name"> & {
  pros: { profiles: { full_name: string | null } | null } | null;
};

const COLUMNS =
  "id, source_job_id, trade, zone, frequency, anchor, scheduled_window, status, paused_reason, next_due_date, occurrences, pros:pros!recurring_bookings_pro_id_fkey(profiles:profiles!pros_id_fkey(full_name))";

function toRow(r: Raw): RecurringRow {
  return { ...r, pro_name: r.pros?.profiles?.full_name ?? null };
}

export async function listMyRecurringBookings(supabase: SupabaseClient): Promise<RecurringRow[]> {
  const { data, error } = await supabase
    .from("recurring_bookings")
    .select(COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Raw[]).map(toRow);
}

/** The live series (active or paused) for one completed job, if any. */
export async function liveRecurringForJob(supabase: SupabaseClient, jobId: string): Promise<RecurringRow | null> {
  const { data, error } = await supabase
    .from("recurring_bookings")
    .select(COLUMNS)
    .eq("source_job_id", jobId)
    .in("status", ["active", "paused"])
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRow(data as unknown as Raw) : null;
}

export async function createRecurringBooking(
  supabase: SupabaseClient,
  input: { sourceJobId: string; frequency: RecurringFrequency; anchor: number; window: string },
): Promise<string> {
  const { data, error } = await supabase.rpc("create_recurring_booking", {
    p_source_job: input.sourceJobId,
    p_frequency: input.frequency,
    p_anchor: input.anchor,
    p_window: input.window,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function setRecurringStatus(
  supabase: SupabaseClient,
  id: string,
  action: "pause" | "resume" | "cancel",
): Promise<void> {
  const { error } = await supabase.rpc("set_recurring_booking_status", { p_id: id, p_action: action });
  if (error) throw new Error(error.message);
}
