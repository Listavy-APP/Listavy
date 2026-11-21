import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listTrades, tradeMap, type CatalogTrade } from "@/lib/data/trades";

/** The active catalog for this request. Deduplicated per request by React cache. */
export const getTradeCatalog = cache(async (): Promise<CatalogTrade[]> => {
  const supabase = await createSupabaseServerClient();
  return listTrades(supabase);
});

/** Same catalog as a key lookup, for display helpers. */
export const getTradeMap = cache(async () => tradeMap(await getTradeCatalog()));
