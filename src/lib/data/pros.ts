import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUCKETS,
  signedUrl,
  uploadCompanyDocument,
  uploadJpeg,
} from "@/lib/storage/proFiles";
import type { ProCard, ProFile, Pro, ProType, Trade } from "@/lib/types/database";
import { DEFAULT_CITY, type City } from "@/lib/domain/catalog";
import type { PriceUnit } from "@/lib/domain/price-unit";

/**
 * Data-access layer for pros. UI code calls these functions, never raw queries.
 */

export interface CompanyInput {
  razonSocial: string;
  /** 9 digits, validated by the form and by a database check. */
  rnc: string;
  document: Blob;
  documentType: "image/jpeg" | "application/pdf";
}

export interface ProApplicationInput {
  fullName: string;
  trade: Trade;
  zone: string;
  /** Municipality id (0111). Required for new applications. */
  municipalityId: string;
  priceMinDop: number;
  priceMaxDop: number;
  /** Unit of the reference range (0115). Defaults to per job. */
  priceUnit: PriceUnit;
  idDocument: Blob;
  workPhotos: Blob[];
  proType: ProType;
  /** Required when proType is "company". Must be absent for "individual". */
  company?: CompanyInput;
  /** Optional profile photo. Shown only after an admin approves it. */
  avatar?: Blob;
  /** Companies only: free-text line of work (migration 0110). Admin resolves it after signup. */
  customLine?: string;
}

/** Columns the signed-in pro may read directly. Private columns come from get_my_pro_status(). */
const OWN_PRO_COLUMNS =
  "id, trade, zone, price_min_dop, price_max_dop, price_unit, verification_status, verified_at, plan, pro_type, created_at, bio, available, is_demo, specialties";

/** Returns the signed-in user's pro application, or null. */
export async function getMyPro(supabase: SupabaseClient): Promise<Pro | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase
    .from("pros")
    .select(OWN_PRO_COLUMNS)
    .eq("id", userData.user.id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer tu perfil profesional: ${error.message}`);
  if (!data) return null;
  const { data: status, error: statusErr } = await supabase.rpc("get_my_pro_status");
  if (statusErr) throw new Error(`No se pudo leer el estado de tu perfil: ${statusErr.message}`);
  const s = (Array.isArray(status) ? status[0] : status) as
    | { rejection_reason: string | null; pro_free_until: string | null; closed_at: string | null; plan_current_period_end: string | null }
    | undefined;
  return {
    ...(data as unknown as Pro),
    rejection_reason: s?.rejection_reason ?? null,
    pro_free_until: s?.pro_free_until ?? null,
    closed_at: s?.closed_at ?? null,
    plan_current_period_end: s?.plan_current_period_end ?? null,
  };
}

/**
 * Creates the pro row (status pending), saves the name, and uploads the ID and work photos.
 * Applying never grants the verified badge. Only an admin does that.
 */
export async function createProApplication(
  supabase: SupabaseClient,
  input: ProApplicationInput,
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Debes entrar primero.");

  const company = input.proType === "company" ? input.company : undefined;
  if (input.proType === "company" && !company) {
    throw new Error("Faltan los datos de la empresa.");
  }

  // Upload files first. If an upload fails, no pro row exists and the applicant can retry.
  const idPath = await uploadJpeg(supabase, BUCKETS.documents, uid, input.idDocument);
  const workPaths: string[] = [];
  for (const photo of input.workPhotos) {
    workPaths.push(await uploadJpeg(supabase, BUCKETS.workPhotos, uid, photo));
  }
  const companyPath = company
    ? await uploadCompanyDocument(supabase, uid, company.document, company.documentType)
    : null;
  const avatarPath = input.avatar
    ? await uploadJpeg(supabase, BUCKETS.avatars, uid, input.avatar)
    : null;

  // One transaction in the database: name, pro row, company row, file rows.
  // If any insert fails, nothing is written and the applicant can retry.
  const { error } = await supabase.rpc("create_pro_application", {
    p_full_name: input.fullName,
    p_trade: input.trade,
    p_zone: input.zone,
    p_price_min: input.priceMinDop,
    p_price_max: input.priceMaxDop,
    p_pro_type: input.proType,
    p_id_path: idPath,
    p_work_paths: workPaths,
    p_company_path: companyPath,
    p_razon_social: company?.razonSocial ?? null,
    p_rnc: company?.rnc ?? null,
    p_avatar_path: avatarPath,
    p_custom_line: input.proType === "company" ? input.customLine ?? null : null,
    p_municipality_id: input.municipalityId,
    p_price_unit: input.priceUnit,
  });
  if (error) throw error;
}

/** Approved pros for a trade and/or zone. Uses the list_pro_cards function. */
export async function listProCards(
  supabase: SupabaseClient,
  filters: { trade?: Trade | null; zone?: string | null; city?: City; proType?: ProType | null } = {},
): Promise<ProCard[]> {
  const { data, error } = await supabase.rpc("list_pro_cards", {
    p_trade: filters.trade ?? null,
    p_zone: filters.zone ?? null,
    p_pro_id: null,
    p_city: filters.city ?? DEFAULT_CITY,
    p_pro_type: filters.proType ?? null,
  });
  if (error) throw new Error(`No se pudo buscar profesionales: ${error.message}`);
  return (data ?? []) as ProCard[];
}

/** One approved pro's public card, or null when the pro is not approved or not found. */
export async function getProCard(supabase: SupabaseClient, id: string): Promise<ProCard | null> {
  const { data, error } = await supabase.rpc("list_pro_cards", {
    p_trade: null,
    p_zone: null,
    p_pro_id: id,
  });
  if (error) throw new Error(`No se pudo cargar el perfil: ${error.message}`);
  return ((data ?? []) as ProCard[])[0] ?? null;
}

/** Public extras from migration 0110: a company's write-in and the folded specialties. */
export async function getProPublicExtras(
  supabase: SupabaseClient,
  id: string,
): Promise<{ customLine: string | null; specialties: string[] }> {
  const { data, error } = await supabase.from("pros").select("custom_line, specialties").eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo cargar el perfil: ${error.message}`);
  const row = data as { custom_line: string | null; specialties: string[] | null } | null;
  return { customLine: row?.custom_line ?? null, specialties: row?.specialties ?? [] };
}

/** Saves the pro's specialties. The database checks them against the catalog list for the pro's trade. */
export async function setMySpecialties(supabase: SupabaseClient, specialties: string[]): Promise<void> {
  const { error } = await supabase.rpc("pro_set_specialties", { p_specialties: specialties });
  if (error) throw error;
}

/** Signed URLs for an approved pro's work photos. RLS limits them to approved pros. */
export async function getWorkPhotoUrls(supabase: SupabaseClient, proId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("pro_files")
    .select("*")
    .eq("pro_id", proId)
    .eq("kind", "work_photo")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron cargar las fotos: ${error.message}`);

  const files = (data ?? []) as ProFile[];
  const urls = await Promise.all(
    files.map((f) => signedUrl(supabase, BUCKETS.workPhotos, f.storage_path)),
  );
  return urls.filter((u): u is string => u !== null);
}

/** Up to 3 boosted pro ids for a search, newest boost first. Same filters as listProCards. */
export async function listBoostedProIds(
  supabase: SupabaseClient,
  filters: { trade?: Trade | null; zone?: string | null; city?: City } = {},
): Promise<string[]> {
  const { data, error } = await supabase.rpc("boosted_pro_ids", {
    p_trade: filters.trade ?? null,
    p_zone: filters.zone ?? null,
    p_city: filters.city ?? DEFAULT_CITY,
  });
  if (error) throw new Error(`No se pudieron cargar los destacados: ${error.message}`);
  return ((data ?? []) as { pro_id: string }[]).map((r) => r.pro_id);
}

/**
 * Cards for a set of pro ids (boosted pros). Fetched by id, so the list_pro_cards
 * row limit does not hide them. Ids that are not approved are dropped.
 * Order follows the input ids.
 */
export async function getProCardsByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<ProCard[]> {
  const cards = await Promise.all(ids.map((id) => getProCard(supabase, id)));
  return cards.filter((c): c is ProCard => c !== null);
}

/** Whether a pro has an active paid boost. */
export async function isProBoosted(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_pro_boosted", { p_pro: id });
  if (error) throw new Error(`No se pudo cargar el estado del perfil: ${error.message}`);
  return data === true;
}

/** Completed jobs for a pro (public count) and the date the pro joined. */
export async function getProStats(
  supabase: SupabaseClient,
  id: string,
): Promise<{ completedJobs: number; joinedAt: string | null }> {
  const { data: jobs, error: jErr } = await supabase.rpc("pro_completed_jobs", { p_pro: id });
  if (jErr) throw new Error(`No se pudieron leer los trabajos: ${jErr.message}`);
  const { data: pro, error: pErr } = await supabase.from("pros").select("created_at").eq("id", id).maybeSingle();
  if (pErr) throw new Error(`No se pudo leer la fecha de alta: ${pErr.message}`);
  return { completedJobs: Number(jobs ?? 0), joinedAt: (pro as { created_at: string } | null)?.created_at ?? null };
}

/** Public weekly hours and today's day-off flag (migration 0090). Null when the pro is not approved or closed. */
export type ProSchedule = {
  weekly: { weekday: number; start: string; end: string }[];
  off_today: boolean;
};

export async function getProSchedule(supabase: SupabaseClient, proId: string): Promise<ProSchedule | null> {
  const { data, error } = await supabase.rpc("get_pro_schedule", { p_pro: proId });
  if (error) throw new Error(`No se pudo cargar el horario: ${error.message}`);
  return (data as ProSchedule | null) ?? null;
}
