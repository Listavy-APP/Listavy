// WhatsApp template variables (0118). Pure functions, no Deno APIs, so Node tests can import this file.
// The approved template wording lives in Twilio and Meta and is never copied here. This module only
// turns named values into Twilio's positional ContentVariables ("1", "2", ...).

export type WhatsAppKindConfig = { sid: string; language: string; vars: string[] };
export type WhatsAppConfig = {
  ui_enabled?: boolean;
  messaging_service_sid: string;
  kinds: Record<string, WhatsAppKindConfig>;
};

export type WhatsAppValues = Record<string, string>;

/** Dominican pesos as the app writes them: RD$1,500. Empty for a missing or non-numeric amount. */
export function formatDop(amount: unknown): string {
  return typeof amount === "number" && Number.isFinite(amount) ? `RD$${amount.toLocaleString("es-DO")}` : "";
}

/** First word of the stored name, like the email greeting. Empty when no name is stored. */
export function firstName(name: string | null | undefined): string {
  return name ? name.trim().split(/\s+/)[0] ?? "" : "";
}

/**
 * Builds Twilio ContentVariables from the variable names configured for a kind. Position n (1-based)
 * takes the value of the n-th name. Returns null when a configured value is missing, so the send is
 * logged as failed instead of sending a blank placeholder.
 */
export function buildContentVariables(vars: string[], values: WhatsAppValues): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (let i = 0; i < vars.length; i++) {
    const v = values[vars[i]];
    // Only the first name may be blank (a profile can lack a name). Every other value is required.
    if (v === undefined || (v === "" && vars[i] !== "first_name")) return null;
    out[String(i + 1)] = v;
  }
  return out;
}

/**
 * Schedule label for the job's accepted quote window, in Santo Domingo time:
 * "sábado 29 de noviembre, en la mañana". Empty when there is no window.
 */
export function scheduleLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  const period = hour < 12 ? "mañana" : hour < 17 ? "tarde" : "noche";
  return `${get("weekday")} ${get("day")} de ${get("month")}, en la ${period}`;
}

/** A kind is sendable only when its SID and at least one variable mapping are configured. */
export function kindConfig(config: WhatsAppConfig, kind: string): WhatsAppKindConfig | null {
  const k = config.kinds?.[kind];
  return k && typeof k.sid === "string" && k.sid.startsWith("HX") && Array.isArray(k.vars) ? k : null;
}
