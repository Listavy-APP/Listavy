import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKETS, signedUrl, uploadJpeg } from "@/lib/storage/proFiles";
import type { ProCard, ProFile, Pro, Trade } from "@/lib/types/database";

/**
 * Data-access layer for pros. UI code calls these functions, never raw queries.
 */

export interface ProApplicationInput {
  fullName: string;
  trade: Trade;
  zone: string;
  priceMinDop: number;
  priceMaxDop: number;
  idDocument: Blob;
  workPhotos: Blob[];
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

  // Upload files first. If an upload fails, no pro row exists and the applicant can retry.
  const idPath = await uploadJpeg(supabase, BUCKETS.documents, uid, input.idDocument);
  const workPaths: string[] = [];
  for (const photo of input.workPhotos) {
    workPaths.push(await uploadJpeg(supabase, BUCKETS.workPhotos, uid, photo));
  }

  const { error: nameError } = await supabase
    .from("profiles")
    .update({ full_name: input.fullName })
    .eq("id", uid);
  if (nameError) throw nameError;

  const { error: proError } = await supabase.from("pros").insert({
    id: uid,
    trade: input.trade,
    zone: input.zone,
    price_min_dop: input.priceMinDop,
    price_max_dop: input.priceMaxDop,
  });
  if (proError) throw proError;

  const fileRows = [
    { pro_id: uid, kind: "id_document", storage_path: idPath },
    ...workPaths.map((path) => ({ pro_id: uid, kind: "work_photo", storage_path: path })),
  ];
  const { error: filesError } = await supabase.from("pro_files").insert(fileRows);
  if (filesError) throw filesError;
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
