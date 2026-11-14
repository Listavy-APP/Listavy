import type { SupabaseClient } from "@supabase/supabase-js";

/** Data-access for a customer's own jobs and reviews. Reads go through RLS. */

export interface CustomerJob {
  id: string;
  trade: string;
  zone: string;
  status: string;
  payment_status: string;
  created_at: string;
  approved_quote: { amount_dop: number } | null;
  pros: { profiles: { full_name: string | null } | null } | null;
}

export interface CustomerReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  pro_name: string | null;
}

/** Jobs the signed-in user requested as homeowner (client view). */
/** Jobs assigned to the signed-in user as the pro (pro view). */
export async function listProJobs(supabase: SupabaseClient, proId: string): Promise<CustomerJob[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, trade, zone, status, payment_status, created_at, approved_quote:quotes!jobs_approved_quote_id_fkey(amount_dop), pros:pros!jobs_pro_id_fkey(profiles:profiles!pros_id_fkey(full_name))",
    )
    .eq("pro_id", proId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`No se pudieron leer tus trabajos: ${error.message}`);
  // To-one joins come back as objects at runtime; the generated types read them as arrays.
  return (data ?? []) as unknown as CustomerJob[];
}

export async function listMyJobs(supabase: SupabaseClient, homeownerId: string): Promise<CustomerJob[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, trade, zone, status, payment_status, created_at, approved_quote:quotes!jobs_approved_quote_id_fkey(amount_dop), pros:pros!jobs_pro_id_fkey(profiles:profiles!pros_id_fkey(full_name))",
    )
    .eq("homeowner_id", homeownerId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`No se pudieron leer tus trabajos: ${error.message}`);
  // To-one joins come back as objects at runtime; the generated types read them as arrays.
  return (data ?? []) as unknown as CustomerJob[];
}

export async function listMyReviews(supabase: SupabaseClient, reviewerId: string): Promise<CustomerReview[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at, pros:pros!reviews_pro_id_fkey(profiles:profiles!pros_id_fkey(full_name))")
    .eq("reviewer_id", reviewerId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`No se pudieron leer tus reseñas: ${error.message}`);

  type Row = {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    pros: { profiles: { full_name: string | null } | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    created_at: r.created_at,
    pro_name: r.pros?.profiles?.full_name ?? null,
  }));
}
