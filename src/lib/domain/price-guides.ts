/**
 * Public price guides (migration 0094). Pure logic only: no I/O.
 * GUIDE_MIN_SAMPLE must match the threshold in get_price_guides().
 */

/** Fewest approved pros with a stated range before a trade shows numbers. Matches the SQL. */
export const GUIDE_MIN_SAMPLE = 3;

/** Platform diagnostic visit band. Counts toward the repair when the client hires the pro. */
export const DIAGNOSTIC_BAND_DOP = { min: 500, max: 1000 } as const;

export type PriceGuideRow = {
  trade: string;
  sample: number;
  low_dop: number | null;
  high_dop: number | null;
};

export type PriceGuide = { sample: number; low: number; high: number };

/** A guide only when the sample reaches the threshold and both numbers exist. */
export function guideFor(rows: readonly PriceGuideRow[], trade: string): PriceGuide | null {
  const row = rows.find((r) => r.trade === trade);
  if (!row || row.sample < GUIDE_MIN_SAMPLE) return null;
  if (row.low_dop === null || row.high_dop === null) return null;
  return { sample: row.sample, low: row.low_dop, high: row.high_dop };
}

/** "RD$1,000 – RD$2,000" using the caller's money formatter. */
export function formatRange(low: number, high: number, dop: (n: number) => string): string {
  return `${dop(low)} – ${dop(high)}`;
}
