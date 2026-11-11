import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types/database";

/**
 * Data-access layer for profiles. UI code calls these functions, never raw queries.
 * Keep all table access in src/lib/data/ so a future database move touches one folder.
 */

const PROFILE_COLUMNS =
  "id, role, full_name, phone, created_at, email, email_verified_at, zone, avatar_path";

export async function getCurrentProfile(supabase: SupabaseClient): Promise<Profile | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userData.user.id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`);
  return data as Profile | null;
}

/** Name and zone. Phone and email are not edited here (see migration 0009 guard). */
export async function updateCustomerProfile(
  supabase: SupabaseClient,
  userId: string,
  input: { full_name: string; zone: string },
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: input.full_name.trim(), zone: input.zone })
    .eq("id", userId);
  if (error) throw new Error(`No se pudo guardar: ${error.message}`);
}

/** Sets or clears the customer photo path. The guard requires the path to be in the caller's folder. */
export async function setCustomerAvatar(
  supabase: SupabaseClient,
  userId: string,
  path: string | null,
): Promise<void> {
  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", userId);
  if (error) throw new Error(`No se pudo guardar la foto: ${error.message}`);
}
