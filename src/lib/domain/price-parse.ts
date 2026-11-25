/**
 * Parses a whole-peso price typed as "1800", "1,800", "1 800" or "1800.50".
 * Separators are stripped and decimals round to the nearest peso. Returns null for anything else.
 */
export function parsePriceDop(raw: string): number | null {
  const cleaned = raw.replace(/[\s,]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned));
}
