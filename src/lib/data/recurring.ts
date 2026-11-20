import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecurringFrequency, RecurringStatus } from "@/lib/domain/recurring";
import { getProCardsByIds } from "@/lib/data/pros";

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

type Raw = Omit<RecurringRow, "pro_name"> & { pro_id: string };

// Pro names come from the public card (list_pro_cards), not an embedded profiles read: clients cannot read
// a pro's profile row, so the embed returned null. The card exposes only public fields.
const COLUMNS =
  "id, pro_id, source_job_id, trade, zone, frequency, anchor, scheduled_window, status, paused_reason, next_due_date, occurrences";

async function withProNames(supabase: SupabaseClient, raws: Raw[]): Promise<RecurringRow[]> {
  const ids = [...new Set(raws.map((r) => r.pro_id))];
  const cards = await getProCardsByIds(supabase, ids);
  const names = new Map(cards.map((c) => [c.id, c.full_name ?? null]));
  return raws.map(({ pro_id, ...r }) => ({ ...r, pro_name: names.get(pro_id) ?? null }));
}

export async function listMyRecurringBookings(supabase: SupabaseClient): Promise<RecurringRow[]> {
  const { data, error } = await supabase
    .from("recurring_bookings")
    .select(COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return withProNames(supabase, (data ?? []) as unknown as Raw[]);
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
  if (!data) return null;
  const [row] = await withProNames(supabase, [data as unknown as Raw]);
  return row ?? null;
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
