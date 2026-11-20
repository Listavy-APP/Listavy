// Recurring booking rules shared by the forms and lists. The database enforces the same limits (0096).

import { es } from "../i18n/es.ts";

export const RECURRING_FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export type RecurringStatus = "active" | "paused" | "cancelled";

/** Weekly and biweekly: 0 (Sunday) to 6. Monthly: 1 to 31. Same numbering as the database. */
export function anchorProblem(frequency: RecurringFrequency, anchor: number): boolean {
  if (frequency === "monthly") return !Number.isInteger(anchor) || anchor < 1 || anchor > 31;
  return !Number.isInteger(anchor) || anchor < 0 || anchor > 6;
}

/** Plain-language rule, e.g. "Cada lunes" or "El día 15 de cada mes". */
export function frequencyLine(frequency: RecurringFrequency, anchor: number): string {
  if (frequency === "monthly") return es.recurring.every.monthly(anchor);
  const day = es.recurring.weekdays[anchor] ?? "";
  return frequency === "weekly" ? es.recurring.every.weekly(day) : es.recurring.every.biweekly(day);
}

/** Default anchor for the form: the weekday or day of month of the given Santo Domingo date (YYYY-MM-DD). */
export function defaultAnchor(frequency: RecurringFrequency, isoDate: string): number {
  if (frequency === "monthly") return Number(isoDate.slice(8, 10));
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
