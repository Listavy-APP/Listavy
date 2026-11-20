/**
 * Cancellation fee rules for the client UI. Mirrors cancel_job_with_refund and cancellation_preview
 * (migration 0107). The database is the source of truth; the RLS suite checks the two agree.
 */

export const CANCELLATION_FEE_DOP = 300;
export const CANCELLATION_GRACE_HOURS = 2;

/** Fee for a client cancel. The fee comes from the charged part only: the tip is never kept. */
export function cancellationFeeDop(amountDop: number, tipDop: number): number {
  return Math.max(0, Math.min(CANCELLATION_FEE_DOP, amountDop - tipDop));
}

/** True when a client cancel falls after the grace window measured from the first held payment. */
export function isPastGrace(paidAtMs: number, nowMs: number): boolean {
  return nowMs - paidAtMs >= CANCELLATION_GRACE_HOURS * 60 * 60 * 1000;
}

/** Refund for a cancel: everything held, minus the fee kept for the pro. */
export function refundAfterFee(paidDop: number, feeDop: number): number {
  return Math.max(0, paidDop - feeDop);
}

export function formatDop(amount: number): string {
  return `RD$${amount.toLocaleString("es-DO")}`;
}
