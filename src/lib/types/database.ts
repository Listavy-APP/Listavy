/**
 * Hand-written row types for the Sprint 0 schema (supabase/migrations/0001_init.sql).
 * Replace with generated types once the project is linked:
 *   supabase gen types typescript --project-id <id> > src/lib/types/database.ts
 * Keep these in sync with the migration until then.
 */

export type Role = "homeowner" | "pro" | "admin";
export type Trade = "plumber" | "electrician" | "ac_technician";
export type VerificationStatus = "pending" | "approved" | "suspended";
export type ProPlan = "free" | "pro";
export type ProType = "individual" | "company";
export type JobStatus =
  | "requested"
  | "quoted"
  | "accepted"
  | "in_progress"
  | "awaiting_approval"
  | "completed"
  | "disputed"
  | "cancelled";
export type QuoteStatus = "sent" | "accepted" | "rejected" | "withdrawn";
export type PaymentStatus = "pending" | "held" | "released" | "refunded" | "disputed";
export type Currency = "USD" | "DOP";
export type DisputeStatus = "open" | "resolved_homeowner" | "resolved_pro";

export interface Profile {
  id: string;
  role: Role;
  full_name: string | null;
  phone: string | null;
  created_at: string;
}

export interface Pro {
  id: string;
  trade: Trade;
  zone: string;
  price_min_dop: number;
  price_max_dop: number;
  verification_status: VerificationStatus;
  verified_at: string | null;
  verified_by: string | null;
  plan: ProPlan;
  pro_type: ProType;
  created_at: string;
}

/** Private company data. Owner and admins only. Never shown in search or on public profiles. */
export interface ProCompany {
  pro_id: string;
  razon_social: string;
  rnc: string;
  rnc_verified_at: string | null;
  rnc_verified_by: string | null;
  created_at: string;
}

export interface Job {
  id: string;
  homeowner_id: string;
  pro_id: string | null;
  trade: Trade;
  zone: string;
  description: string;
  status: JobStatus;
  fx_rate_dop_per_usd: number;
  created_at: string;
}

export interface Quote {
  id: string;
  job_id: string;
  pro_id: string;
  amount_dop: number;
  status: QuoteStatus;
  created_at: string;
}

export interface Payment {
  id: string;
  job_id: string;
  provider: string;
  currency: Currency;
  amount_minor: number;
  fx_rate_dop_per_usd: number;
  commission_dop: number | null;
  status: PaymentStatus;
  created_at: string;
}

export interface Review {
  id: string;
  job_id: string;
  reviewer_id: string;
  pro_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface Dispute {
  id: string;
  job_id: string;
  opened_by: string;
  reason: string;
  status: DisputeStatus;
  created_at: string;
  resolved_at: string | null;
}

export type ProFileKind = "id_document" | "work_photo" | "company_document" | "avatar";

export interface ProFile {
  id: string;
  pro_id: string;
  kind: ProFileKind;
  storage_path: string;
  created_at: string;
}

/** Row returned by the list_pro_cards() function. Safe to show to other users. */
export interface ProCard {
  id: string;
  full_name: string | null;
  trade: Trade;
  zone: string;
  price_min_dop: number;
  price_max_dop: number;
  plan: ProPlan;
  verified_at: string | null;
  /** Approved profile photo path in the pro-avatars bucket, or null. */
  avatar_path: string | null;
}
