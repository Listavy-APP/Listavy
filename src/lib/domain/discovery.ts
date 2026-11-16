import type { ProCard } from "@/lib/types/database";

/**
 * Pure sort and filter rules for /buscar and the home rails. No I/O, so the rules are easy to test.
 */

export const SORT_KEYS = ["recomendados", "distancia", "precio"] as const;
/** "mejor valorados" is listed in the UI but disabled until reviews exist, so it is not a sort key. */
export type SortKey = (typeof SORT_KEYS)[number];

export function parseSort(value: string | undefined): SortKey {
  return (SORT_KEYS as readonly string[]).includes(value ?? "") ? (value as SortKey) : "recomendados";
}

export function parseDate(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Keeps verified and available pros only when the filter is on. */
export function filterPros<T extends Pick<ProCard, "identity_verified" | "available">>(
  pros: readonly T[],
  opts: { verifiedOnly: boolean; availableOnly: boolean },
): T[] {
  return pros.filter(
    (p) => (!opts.verifiedOnly || p.identity_verified) && (!opts.availableOnly || p.available),
  );
}

/**
 * Organic order. "distancia" puts the chosen zone first (no coordinates exist yet, so this is the only proximity signal).
 * "precio" sorts by the lowest price. "recomendados" keeps the query order (newest approved first).
 */
export function sortPros<T extends Pick<ProCard, "zone" | "price_min_dop">>(
  pros: readonly T[],
  sort: SortKey,
  chosenZone: string | null,
): T[] {
  const copy = [...pros];
  if (sort === "precio") return copy.sort((a, b) => a.price_min_dop - b.price_min_dop);
  if (sort === "distancia" && chosenZone) {
    return copy.sort((a, b) => Number(b.zone === chosenZone) - Number(a.zone === chosenZone));
  }
  return copy;
}
