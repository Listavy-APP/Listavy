import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Builds the user's own data as one JSON document. Every query runs under the user's
 * session, so RLS limits the result to rows the user is allowed to read.
 * Not included: other people's data, completion codes, Stripe identifiers, photos and voice files (paths only).
 */
export async function buildMyDataExport(supabase: SupabaseClient, userId: string): Promise<Record<string, unknown>> {
  const [profile, jobs, quotes, reviews] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, zone, role, created_at").eq("id", userId).maybeSingle(),
    supabase.from("jobs").select("id, trade, zone, status, payment_status, job_type, description, created_at").order("created_at", { ascending: false }),
    supabase.from("quotes").select("id, job_id, amount_dop, status, created_at").eq("pro_id", userId),
    supabase.from("reviews").select("id, job_id, rating, comment, created_at").eq("reviewer_id", userId),
  ]);
  for (const r of [profile, jobs, quotes, reviews]) {
    if (r.error) throw new Error(`No se pudieron preparar tus datos: ${r.error.message}`);
  }
  return {
    exported_at: new Date().toISOString(),
    profile: profile.data,
    jobs: jobs.data ?? [],
    quotes_you_sent: quotes.data ?? [],
    reviews_you_wrote: reviews.data ?? [],
  };
}
