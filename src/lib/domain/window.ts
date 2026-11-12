/**
 * Formats a quote's arrival window for display. Fixed to Santo Domingo time (UTC-4, no daylight
 * saving), so the server render and the phone render always agree.
 */
const TZ = "America/Santo_Domingo";

const dayFmt = new Intl.DateTimeFormat("es-DO", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("es-DO", { hour: "numeric", minute: "2-digit", timeZone: TZ });

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

export function formatWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (dayKey(start) === dayKey(end)) {
    return `${dayFmt.format(start)}, ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
  }
  return `${dayFmt.format(start)} ${timeFmt.format(start)} – ${dayFmt.format(end)} ${timeFmt.format(end)}`;
}
