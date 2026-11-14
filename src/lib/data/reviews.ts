import type { SupabaseClient } from "@supabase/supabase-js";

/** Reviews data access (spec D5). Every write goes through a security definer function (migration 0030). */

export interface ReviewRow {
  id: string;
  job_id: string;
  reviewer_id: string;
  pro_id: string;
  rating: number;
  quality: number | null;
  punctuality: number | null;
  cleanliness: number | null;
  comment: string | null;
  status: "published" | "hidden" | "removed";
  status_reason: string | null;
  created_at: string;
  updated_at: string;
  reviewer_name: string | null;
  response: ReviewResponseRow | null;
}

export interface ReviewResponseRow {
  id: string;
  review_id: string;
  body: string;
  edited: boolean;
}

export interface ReviewSummary {
  average: number | null;
  review_count: number;
}

export interface ReviewInput {
  rating: number;
  quality: number;
  punctuality: number;
  cleanliness: number;
  comment: string | null;
}

/** First name plus last initial, per D5-a. Full names are never shown. */
export function displayReviewer(fullName: string | null): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Cliente";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** Public list for a pro profile. The name comes from list_pro_reviews (migration 0030), because profiles is own-row only. */
export async function listProReviews(supabase: SupabaseClient, proId: string): Promise<ReviewRow[]> {
  const { data, error } = await supabase.rpc("list_pro_reviews", { p_pro: proId });
  if (error) throw new Error(`No se pudieron leer las reseñas: ${error.message}`);

  type Row = {
    id: string;
    job_id: string;
    rating: number;
    quality: number | null;
    punctuality: number | null;
    cleanliness: number | null;
    comment: string | null;
    created_at: string;
    updated_at: string;
    reviewer_name: string;
    response_id: string | null;
    response_body: string | null;
    response_edited: boolean | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    job_id: r.job_id,
    reviewer_id: "",
    pro_id: proId,
    rating: r.rating,
    quality: r.quality,
    punctuality: r.punctuality,
    cleanliness: r.cleanliness,
    comment: r.comment,
    status: "published" as const,
    status_reason: null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    reviewer_name: r.reviewer_name,
    response:
      r.response_id && r.response_body
        ? { id: r.response_id, review_id: r.id, body: r.response_body, edited: Boolean(r.response_edited) }
        : null,
  }));
}

/** The review for one job, if any. RLS limits reads to the reviewer, the pro, and admins. */
export async function getJobReview(supabase: SupabaseClient, jobId: string): Promise<ReviewRow | null> {
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, job_id, reviewer_id, pro_id, rating, quality, punctuality, cleanliness, comment, status, status_reason, created_at, updated_at, review_responses(id, review_id, body, edited)",
    )
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la reseña: ${error.message}`);
  if (!data) return null;
  type Row = Omit<ReviewRow, "reviewer_name" | "response"> & { review_responses: ReviewResponseRow[] | null };
  const r = data as unknown as Row;
  return { ...r, reviewer_name: null, response: r.review_responses?.[0] ?? null };
}

export async function hasClientRating(supabase: SupabaseClient, jobId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("private_client_ratings")
    .select("job_id")
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la calificación del cliente: ${error.message}`);
  return data !== null;
}

export async function getProReviewSummary(supabase: SupabaseClient, proId: string): Promise<ReviewSummary> {
  const { data, error } = await supabase.rpc("pro_review_summary", { p_pro: proId });
  if (error) throw new Error(`No se pudo leer la calificación: ${error.message}`);
  const row = (data ?? [])[0] as { average: number | null; review_count: number } | undefined;
  return {
    average: row?.average == null ? null : Number(row.average),
    review_count: row?.review_count ?? 0,
  };
}

export async function submitReview(supabase: SupabaseClient, jobId: string, input: ReviewInput): Promise<void> {
  const { error } = await supabase.rpc("submit_review", {
    p_job: jobId,
    p_rating: input.rating,
    p_quality: input.quality,
    p_punctuality: input.punctuality,
    p_cleanliness: input.cleanliness,
    p_comment: input.comment,
  });
  if (error) throw new Error(error.message);
}

export async function editReview(supabase: SupabaseClient, reviewId: string, input: ReviewInput): Promise<void> {
  const { error } = await supabase.rpc("edit_review", {
    p_review: reviewId,
    p_rating: input.rating,
    p_quality: input.quality,
    p_punctuality: input.punctuality,
    p_cleanliness: input.cleanliness,
    p_comment: input.comment,
  });
  if (error) throw new Error(error.message);
}

export async function respondToReview(supabase: SupabaseClient, reviewId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc("respond_to_review", { p_review: reviewId, p_body: body });
  if (error) throw new Error(error.message);
}

export async function flagReview(
  supabase: SupabaseClient,
  reviewId: string,
  reason: "personal_data" | "abuse" | "false_claim" | "advertising" | "other",
): Promise<void> {
  const { error } = await supabase.rpc("flag_review", { p_review: reviewId, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function submitClientRating(
  supabase: SupabaseClient,
  jobId: string,
  scores: { punctuality: number; clarity: number; payment: number },
): Promise<void> {
  const { error } = await supabase.rpc("submit_client_rating", {
    p_job: jobId,
    p_punctuality: scores.punctuality,
    p_clarity: scores.clarity,
    p_payment: scores.payment,
  });
  if (error) throw new Error(error.message);
}

export async function moderateReview(
  supabase: SupabaseClient,
  reviewId: string,
  action: "publish" | "hide" | "remove",
  reason: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("moderate_review", {
    p_review: reviewId,
    p_action: action,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

/** Client-side mirror of the contact-detail rule. The database check is authoritative. */
export function reviewHasContactDetails(text: string): boolean {
  return (
    /(https?:\/\/|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i.test(text) ||
    /(instagram|facebook|whatsapp|telegram|tiktok)/i.test(text) ||
    /@[a-z0-9_.]{3,}/i.test(text) ||
    /(\+?\d[\d\s().-]{6,}\d)/.test(text)
  );
}

export interface AdminReviewRow extends ReviewRow {
  flag_reasons: string[];
  held: boolean;
}

/** Admin queue: every review, with flag reasons and whether a dispute holds it. Admin-only by RLS. */
export async function listAdminReviews(supabase: SupabaseClient): Promise<AdminReviewRow[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, job_id, reviewer_id, pro_id, rating, quality, punctuality, cleanliness, comment, status, status_reason, created_at, updated_at, review_flags(reason)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`No se pudieron leer las reseñas: ${error.message}`);

  const { data: openDisputes, error: dErr } = await supabase
    .from("disputes")
    .select("job_id")
    .neq("stage", "closed");
  if (dErr) throw new Error(`No se pudieron leer las disputas: ${dErr.message}`);
  const heldJobs = new Set((openDisputes ?? []).map((d: { job_id: string }) => d.job_id));

  type Row = Omit<ReviewRow, "reviewer_name" | "response"> & {
    review_flags: { reason: string }[] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    reviewer_name: null,
    response: null,
    flag_reasons: (r.review_flags ?? []).map((f) => f.reason),
    held: heldJobs.has(r.job_id),
  }));
}
