/**
 * Urgent lane (0117). Pure logic only. The database is the source of truth; these rules mirror it.
 * Urgent means today: ASAP (no date) or the Santo Domingo date of today. A future date is never urgent.
 */

export const URGENT_FEE_DOP_DEFAULT = 500;

/** True when the schedule fits an urgent job. `scheduledDate` is YYYY-MM-DD, or null for ASAP. */
export function isUrgentScheduleAllowed(scheduledDate: string | null, todayIso: string): boolean {
  if (scheduledDate === null) return true;
  return scheduledDate === todayIso;
}

/** Fee line text for the client and the pro. Whole pesos only. */
export function urgentFeeLabel(feeDop: number): string {
  return `Tarifa por urgencia: RD$${feeDop.toLocaleString("es-DO")}`;
}
