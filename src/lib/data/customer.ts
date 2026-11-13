import type { SupabaseClient } from "@supabase/supabase-js";

/** Data-access for a customer's own jobs and reviews. Reads go through RLS. */

export interface CustomerJob {
  id: string;
  trade: string;
  zone: string;
  status: string;
  payment_status: string;
  created_at: string;
}

export interface CustomerReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  pro_name: string | null;
}

/** Jobs the signed-in user is party to: as homeowner or as the assigned pro. */
export async function listJobsForUser(supabase: SupabaseClient, userId: string): Promise<CustomerJob[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, trade, zone, status, payment_status, created_at")
    .or(`homeowner_id.eq.${userId},pro_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`No se pudieron leer tus trabajos: ${error.message}`);
  return (data ?? []) as CustomerJob[];
}

export async function listMyJobs(supabase: SupabaseClient, homeownerId: string): Promise<CustomerJob[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, trade, zone, status, payment_status, created_at")
    .eq("homeowner_id", homeownerId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`No se pudieron leer tus trabajos: ${error.message}`);
  return (data ?? []) as CustomerJob[];
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
