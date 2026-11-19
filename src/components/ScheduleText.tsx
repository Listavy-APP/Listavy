import { es } from "@/lib/i18n/es";
import { formatScheduleDate, type ScheduleWindow } from "@/lib/domain/schedule";

/** "Lo antes posible" when there is no date, otherwise "jue 20 nov · Mañana (8:00–12:00)". */
export function scheduleText(date: string | null, window: string | null): string {
  if (!date || !window) return es.schedule.asap;
  const label = es.schedule.windows[window as ScheduleWindow] ?? window;
  return `${formatScheduleDate(date)} · ${label}`;
}
