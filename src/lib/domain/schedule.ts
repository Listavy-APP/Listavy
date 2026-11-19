// Scheduling rules shared by the request form, the job page, and the pro calendar.
// The database enforces the same rules (migration 0090). This file gives the user early feedback.
// Dates are "YYYY-MM-DD" strings in America/Santo_Domingo (UTC-4, no DST).

export const SCHEDULE_WINDOWS = ["morning", "afternoon", "evening"] as const;
export type ScheduleWindow = (typeof SCHEDULE_WINDOWS)[number];

/** Window bounds, shown to the user. Windows, never exact times. */
export const WINDOW_RANGE: Record<ScheduleWindow, { start: string; end: string }> = {
  morning: { start: "08:00", end: "12:00" },
  afternoon: { start: "12:00", end: "17:00" },
  evening: { start: "17:00", end: "20:00" },
};

export const MAX_SCHEDULE_DAYS = 60;

const TZ = "America/Santo_Domingo";

/** Today's date in the Dominican Republic, as YYYY-MM-DD. */
export function santoDomingoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Adds whole days to a YYYY-MM-DD string. Calendar arithmetic, so no time-zone drift. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type ScheduleProblem = "pair" | "window" | "past" | "far";

/**
 * Checks a requested schedule. Returns null when valid.
 * A null date and a null window together mean "Lo antes posible" and are valid.
 */
export function scheduleProblem(
  date: string | null,
  window: string | null,
  now: Date = new Date(),
): ScheduleProblem | null {
  if ((date === null) !== (window === null)) return "pair";
  if (date === null) return null;
  if (!SCHEDULE_WINDOWS.includes(window as ScheduleWindow)) return "window";
  const today = santoDomingoToday(now);
  if (date < today) return "past";
  if (date > addDays(today, MAX_SCHEDULE_DAYS)) return "far";
  return null;
}

/** The latest date a client may pick. */
export function maxScheduleDate(now: Date = new Date()): string {
  return addDays(santoDomingoToday(now), MAX_SCHEDULE_DAYS);
}

/** Formats a schedule for display, e.g. "jue 20 nov · Mañana (8:00–12:00)". */
export function formatScheduleDate(date: string): string {
  // Noon in the local zone keeps the calendar day stable for the Dominican display zone.
  return new Intl.DateTimeFormat("es-DO", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${date}T12:00:00-04:00`),
  );
}
