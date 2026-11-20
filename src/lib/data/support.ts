import type { SupabaseClient } from "@supabase/supabase-js";

/** Support tickets (0097). Authors read their own rows. Admin reads and writes go through is_admin() definers. */

export const SUPPORT_CATEGORIES = ["cuenta", "pagos", "trabajo", "verificacion", "otro"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];
export type SupportStatus = "open" | "answered" | "closed";

export type TicketRow = {
  id: string;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  job_id: string | null;
  last_message_at: string;
  created_at: string;
};

export type TicketMessage = { id: string; from_admin: boolean; body: string; created_at: string };

export type AdminTicketRow = TicketRow & { author_id: string; author_name: string | null };

export async function listMyTickets(supabase: SupabaseClient): Promise<TicketRow[]> {
  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, category, subject, status, job_id, last_message_at, created_at")
    .order("last_message_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TicketRow[];
}

export async function getMyTicket(
  supabase: SupabaseClient,
  id: string,
): Promise<{ ticket: TicketRow; messages: TicketMessage[] } | null> {
  const { data: t, error: tErr } = await supabase
    .from("support_tickets")
    .select("id, category, subject, status, job_id, last_message_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!t) return null;
  const { data: m, error: mErr } = await supabase
    .from("support_ticket_messages")
    .select("id, from_admin, body, created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (mErr) throw new Error(mErr.message);
  return { ticket: t as TicketRow, messages: (m ?? []) as TicketMessage[] };
}

/** Jobs the user is a party to, for the optional job picker. RLS limits the rows to the user's own jobs. */
export async function listMyJobsForTicket(supabase: SupabaseClient): Promise<{ id: string; trade: string; zone: string; status: string }[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, trade, zone, status")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; trade: string; zone: string; status: string }[];
}

function rpcError(message: string): Error {
  return new Error(message);
}

export async function createSupportTicket(
  supabase: SupabaseClient,
  input: { category: SupportCategory; subject: string; body: string; jobId: string | null },
): Promise<string> {
  const { data, error } = await supabase.rpc("create_support_ticket", {
    p_category: input.category,
    p_subject: input.subject,
    p_body: input.body,
    p_job: input.jobId,
  });
  if (error) throw rpcError(error.message);
  return data as string;
}

export async function replySupportTicket(supabase: SupabaseClient, ticketId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc("reply_support_ticket", { p_ticket: ticketId, p_body: body });
  if (error) throw rpcError(error.message);
}

export async function closeSupportTicket(supabase: SupabaseClient, ticketId: string): Promise<void> {
  const { error } = await supabase.rpc("close_support_ticket", { p_ticket: ticketId });
  if (error) throw rpcError(error.message);
}

// ---- admin ----------------------------------------------------------------

export async function adminListTickets(supabase: SupabaseClient): Promise<AdminTicketRow[]> {
  const { data, error } = await supabase.rpc("admin_list_support_tickets", { p_status: null });
  if (error) throw rpcError(error.message);
  return (data ?? []) as AdminTicketRow[];
}

export async function adminListMessages(supabase: SupabaseClient, ticketId: string): Promise<TicketMessage[]> {
  const { data, error } = await supabase.rpc("admin_list_support_messages", { p_ticket: ticketId });
  if (error) throw rpcError(error.message);
  return (data ?? []) as TicketMessage[];
}

export async function adminReplyTicket(supabase: SupabaseClient, ticketId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc("admin_reply_support_ticket", { p_ticket: ticketId, p_body: body });
  if (error) throw rpcError(error.message);
}

export async function adminSetTicketStatus(supabase: SupabaseClient, ticketId: string, status: "open" | "closed"): Promise<void> {
  const { error } = await supabase.rpc("admin_set_support_ticket_status", { p_ticket: ticketId, p_status: status });
  if (error) throw rpcError(error.message);
}
