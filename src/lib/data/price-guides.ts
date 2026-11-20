import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriceGuideRow } from "@/lib/domain/price-guides";

/**
 * Data access for public price guides. One aggregate row per trade, from get_price_guides() (migration 0094).
 * Returns no pro rows, names or ids. Throws on error so the caller decides what to show.
 */
export async function listPriceGuides(supabase: SupabaseClient): Promise<PriceGuideRow[]> {
  const { data, error } = await supabase.rpc("get_price_guides");
  if (error) throw new Error(error.message);
  return (data ?? []) as PriceGuideRow[];
}
