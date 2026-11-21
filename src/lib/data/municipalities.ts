import type { SupabaseClient } from "@supabase/supabase-js";

/** A municipality from the nationwide list (0111). Coordinates are never shown. */
export type Municipality = {
  id: string;
  name: string;
  province: string;
  legacyCity: string | null;
};

export type LadderTier = 1 | 2 | 3 | 4;

/** Labels for the search ladder (0112). Shown above each group of results. */
export const TIER_LABEL: Record<LadderTier, string> = {
  1: "En tu municipio",
  2: "En tu provincia",
  3: "Cerca de ti",
  4: "En el país",
};

export type LadderRow = {
  pro_id: string;
  tier: LadderTier;
  municipality_id: string;
  municipality_name: string;
  province: string;
  approx_km: number | null;
};

/** Distance text. Always approximate: the database uses seat centroids. */
export function approxDistance(km: number | null): string | null {
  if (km === null) return null;
  return `a unos ${Math.round(km)} km`;
}

/** Groups municipalities by province, keeping the list order. */
export function groupByProvince(list: readonly Municipality[]): Map<string, Municipality[]> {
  const map = new Map<string, Municipality[]>();
  for (const m of list) {
    const bucket = map.get(m.province);
    if (bucket) bucket.push(m);
    else map.set(m.province, [m]);
  }
  return map;
}

type MunicipalityRow = { id: string; name: string; province: string; legacy_city: string | null };

/** Full list for pickers. Anonymous read is allowed by RLS. */
export async function listMunicipalities(supabase: SupabaseClient): Promise<Municipality[]> {
  const { data, error } = await supabase
    .from("municipalities")
    .select("id, name, province, legacy_city")
    .order("province")
    .order("name");
  if (error) throw new Error(`No se pudieron cargar los municipios: ${error.message}`);
  return ((data ?? []) as MunicipalityRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    province: r.province,
    legacyCity: r.legacy_city,
  }));
}

/** Ladder search (0112). Returns ordered rows; the caller fetches cards by id. */
export async function searchLadder(
  supabase: SupabaseClient,
  input: { trade: string | null; municipalityId: string; limit?: number },
): Promise<LadderRow[]> {
  const { data, error } = await supabase.rpc("search_pros_ladder", {
    p_trade: input.trade,
    p_municipality_id: input.municipalityId,
    p_limit: input.limit ?? 20,
  });
  if (error) throw new Error(`No se pudo buscar profesionales: ${error.message}`);
  return (data ?? []) as LadderRow[];
}
