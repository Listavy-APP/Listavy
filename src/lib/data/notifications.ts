import type { SupabaseClient } from "@supabase/supabase-js";

/** In-app inbox over notification_log (0098). Owner-only RLS. Only delivered (sent) rows appear. */

export type InboxEntry = {
  id: string;
  kind: string;
  channel: "push" | "email";
  created_at: string;
  read_at: string | null;
  link: string | null;
};

export async function listMyInbox(supabase: SupabaseClient): Promise<InboxEntry[]> {
  const { data, error } = await supabase
    .from("notification_log")
    .select("id, kind, channel, created_at, read_at, link")
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as InboxEntry[];
}

export async function countMyUnread(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .is("read_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markInboxRead(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from("notification_log")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

export async function markAllInboxRead(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from("notification_log")
    .update({ read_at: new Date().toISOString() })
    .eq("status", "sent")
    .is("read_at", null);
  if (error) throw new Error(error.message);
}
