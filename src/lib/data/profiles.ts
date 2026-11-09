import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types/database";

/**
 * Data-access layer for profiles. UI code calls these functions, never raw queries.
 * Keep all table access in src/lib/data/ so a future database move touches one folder.
 */

export async function getCurrentProfile(supabase: SupabaseClient): Promise<Profile | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, phone, created_at")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`);
  return data as Profile | null;
}
