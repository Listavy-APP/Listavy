import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One line of work from the trades catalog (migration 0109).
 * label: the line's name, used for category tiles and filters.
 * proLabel: the professional's name where a person is named ("Plomero"). Falls back to label.
 */
export type CatalogTrade = {
  key: string;
  label: string;
  proLabel: string;
  slug: string;
  specialties: string[];
};

type TradeRow = {
  key: string;
  label_es: string;
  pro_label_es: string | null;
  slug: string;
  specialties: string[];
};

/** Active trades in display order. Reads are public (RLS: active rows only). */
export async function listTrades(supabase: SupabaseClient): Promise<CatalogTrade[]> {
  const { data, error } = await supabase
    .from("trades")
    .select("key, label_es, pro_label_es, slug, specialties")
    .eq("active", true)
    .order("sort_order")
    .order("label_es");
  if (error) throw error;
  return ((data ?? []) as TradeRow[]).map(toCatalogTrade);
}

export function toCatalogTrade(row: TradeRow): CatalogTrade {
  return {
    key: row.key,
    label: row.label_es,
    proLabel: row.pro_label_es ?? row.label_es,
    slug: row.slug,
    specialties: row.specialties ?? [],
  };
}

/** Lookup by key. Use this instead of indexing a literal table. */
export function tradeMap(list: readonly CatalogTrade[]): Record<string, CatalogTrade> {
  return Object.fromEntries(list.map((t) => [t.key, t]));
}

/** The professional's name for a key, or the key itself when the key is unknown. */
export function proLabelOf(map: Record<string, CatalogTrade>, key: string | null | undefined): string {
  if (!key) return "";
  return map[key]?.proLabel ?? key;
}

/** The line's name for a key, or the key itself when the key is unknown. */
export function labelOf(map: Record<string, CatalogTrade>, key: string | null | undefined): string {
  if (!key) return "";
  return map[key]?.label ?? key;
}
