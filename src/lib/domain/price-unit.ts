/**
 * Price unit for a pro's reference range (0115). Pure logic only.
 * Advertising and reference only: no billing or time tracking depends on it.
 */

export const PRICE_UNITS = ["job", "hour", "visit"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export function isPriceUnit(value: unknown): value is PriceUnit {
  return typeof value === "string" && (PRICE_UNITS as readonly string[]).includes(value);
}

/** Aggregates (price guides, home minimums) count only per-job ranges. Hourly and visit ranges never mix in. */
export function isJobUnit(unit: PriceUnit | null | undefined): boolean {
  return unit === "job";
}
