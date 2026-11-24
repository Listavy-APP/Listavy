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

const OUTCOMES: Record<string, string> = {
  resolved_homeowner: "El caso se resolvió a favor del cliente.",
  resolved_pro: "El caso se resolvió a favor del profesional.",
};

/** Same wording as the email copy for a dispute decision. */
export function outcomeText(outcome: unknown): string {
  return (typeof outcome === "string" && OUTCOMES[outcome]) || "Se tomó una decisión sobre la disputa.";
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
    if (v === undefined) return null;
    out[String(i + 1)] = v;
  }
  return out;
}

/** A kind is sendable only when its SID and at least one variable mapping are configured. */
export function kindConfig(config: WhatsAppConfig, kind: string): WhatsAppKindConfig | null {
  const k = config.kinds?.[kind];
  return k && typeof k.sid === "string" && k.sid.startsWith("HX") && Array.isArray(k.vars) ? k : null;
}
