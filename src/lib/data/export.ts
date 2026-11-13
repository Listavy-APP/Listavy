import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Builds the user's own data as one JSON document. Each query runs under the user's
 * session, so RLS limits rows to what the user may read. Where RLS allows more
 * (disputes, evidence), the query filters to the user's own writing.
 * Not included: other people's text, completion codes, Stripe identifiers, file contents
 * (job photos and voice notes are kept in the job records; dispute evidence is text only).
 */
export async function buildMyDataExport(supabase: SupabaseClient, userId: string): Promise<Record<string, unknown>> {
  const [profile, jobs, quotes, reviews, payments, disputes, evidence, notifications] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, zone, role, created_at").eq("id", userId).maybeSingle(),
    supabase.from("jobs").select("id, trade, zone, status, payment_status, job_type, description, created_at").order("created_at", { ascending: false }),
    supabase.from("quotes").select("id, job_id, amount_dop, status, created_at").eq("pro_id", userId),
    supabase.from("reviews").select("id, job_id, rating, comment, created_at").eq("reviewer_id", userId),
    supabase.from("payments").select("id, job_id, amount_dop, tip_dop, commission_dop, pro_payout_dop, status, purpose, created_at").order("created_at", { ascending: false }),
    supabase.from("disputes").select("id, job_id, opened_by, opened_side, reason, stage, status, outcome, refund_dop, opened_at, decided_at, decision_reason"),
    supabase.from("dispute_evidence").select("dispute_id, author_id, side, statement, created_at").eq("author_id", userId),
    supabase.from("dispute_notifications").select("id, dispute_id, kind, body, created_at").order("created_at", { ascending: false }),
  ]);
  for (const r of [profile, jobs, quotes, reviews, payments, disputes, evidence, notifications]) {
    if (r.error) throw new Error(`No se pudieron preparar tus datos: ${r.error.message}`);
  }
  const myDisputes = (disputes.data ?? []).map((d) => ({
    ...d,
    // The reason is the opener's text. Show it only when the user opened the dispute.
    reason: d.opened_by === userId ? d.reason : undefined,
    opened_by: undefined,
  }));
  return {
    exported_at: new Date().toISOString(),
    note_device_settings:
      "La preferencia de analítica de uso se guarda solo en este dispositivo y no aparece en esta exportación.",
    profile: profile.data,
    jobs: jobs.data ?? [],
    payments: payments.data ?? [],
    quotes_you_sent: quotes.data ?? [],
    reviews_you_wrote: reviews.data ?? [],
    disputes: myDisputes,
    dispute_statements_you_wrote: evidence.data ?? [],
    notifications: notifications.data ?? [],
  };
}
