import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * In-app inbox over notification_log (0098). One entry per event: the push and email rows of one
 * event share an entry and a read state. An entry exists when any channel was attempted.
 */

export type InboxEntry = {
  /** Earliest row id in the group. Stable across reloads. */
  id: string;
  kind: string;
  link: string | null;
  last_at: string;
  channels: ("push" | "email")[];
  delivered: boolean;
  unread: boolean;
  row_ids: string[];
};

type GroupRow = {
  group_id: string;
  kind: string;
  link: string | null;
  first_at: string;
  last_at: string;
  row_ids: string[];
  channels: ("push" | "email")[];
  delivered: boolean;
  unread: boolean;
};

const INTERNAL_LINK = /^\/(?!\/)/;

export async function listMyInbox(supabase: SupabaseClient): Promise<InboxEntry[]> {
  const { data, error } = await supabase.rpc("my_notification_groups", { p_limit: 50 });
  if (error) throw new Error(error.message);
  return ((data ?? []) as GroupRow[]).map((g) => ({
    id: g.group_id,
    kind: g.kind,
    link: g.link && INTERNAL_LINK.test(g.link) ? g.link : null,
    last_at: g.last_at,
    channels: g.channels,
    delivered: g.delivered,
    unread: g.unread,
    row_ids: g.row_ids,
  }));
}

/** Unread events, counted over the newest 200. The bell and the page use the same grouping. */
export async function countMyUnread(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("my_notification_groups", { p_limit: 200 });
  if (error) throw new Error(error.message);
  return ((data ?? []) as GroupRow[]).filter((g) => g.unread).length;
}

/** Marks every row of one event read. RLS limits the update to the caller's rows. */
export async function markInboxEntryRead(supabase: SupabaseClient, rowIds: string[]): Promise<void> {
  const { error } = await supabase
    .from("notification_log")
    .update({ read_at: new Date().toISOString() })
    .in("id", rowIds)
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

export async function markAllInboxRead(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from("notification_log")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw new Error(error.message);
}
