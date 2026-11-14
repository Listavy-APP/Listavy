import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUCKETS,
  signedUrl,
  uploadCompanyDocument,
  uploadJpeg,
} from "@/lib/storage/proFiles";
import type { ProCard, ProFile, Pro, ProType, Trade } from "@/lib/types/database";

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
  priceMinDop: number;
  priceMaxDop: number;
  idDocument: Blob;
  workPhotos: Blob[];
  proType: ProType;
  /** Required when proType is "company". Must be absent for "individual". */
  company?: CompanyInput;
  /** Optional profile photo. Shown only after an admin approves it. */
  avatar?: Blob;
}

/** Returns the signed-in user's pro application, or null. */
export async function getMyPro(supabase: SupabaseClient): Promise<Pro | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase
    .from("pros")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer tu perfil profesional: ${error.message}`);
  return data as Pro | null;
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
  });
  if (error) throw error;
}

/** Approved pros for a trade and/or zone. Uses the list_pro_cards function. */
export async function listProCards(
  supabase: SupabaseClient,
  filters: { trade?: Trade | null; zone?: string | null } = {},
): Promise<ProCard[]> {
  const { data, error } = await supabase.rpc("list_pro_cards", {
    p_trade: filters.trade ?? null,
    p_zone: filters.zone ?? null,
    p_pro_id: null,
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
  filters: { trade?: Trade | null; zone?: string | null } = {},
): Promise<string[]> {
  const { data, error } = await supabase.rpc("boosted_pro_ids", {
    p_trade: filters.trade ?? null,
    p_zone: filters.zone ?? null,
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
