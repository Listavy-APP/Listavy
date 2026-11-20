import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChecklistRow } from "@/lib/domain/proChecklist";

/** Checklist and nudge dismissal (0099). Both calls are scoped to the signed-in pro by the database. */

export async function getMyProChecklist(supabase: SupabaseClient): Promise<ChecklistRow[]> {
  const { data, error } = await supabase.rpc("get_my_pro_checklist");
  if (error) throw new Error(error.message);
  return (data ?? []) as ChecklistRow[];
}

export async function dismissProNudge(supabase: SupabaseClient, item: ChecklistRow["item"]): Promise<void> {
  const { error } = await supabase.rpc("dismiss_my_pro_nudge", { p_item: item });
  if (error) throw new Error(error.message);
}
