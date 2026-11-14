import type { SupabaseClient } from "@supabase/supabase-js";

/** Pro ids the signed-in user has saved. RLS limits rows to the caller. */
export async function listSavedProIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("saved_pros")
    .select("pro_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`No se pudieron leer tus guardados: ${error.message}`);
  return ((data ?? []) as { pro_id: string }[]).map((r) => r.pro_id);
}
