/**
 * Country calling codes offered at sign-in and phone change. Common for Listavy's clients
 * (Dominican Republic, US, Puerto Rico, Spain, UK, and diaspora countries). Not a full list.
 * Codes are digits only; the stored phone is E.164 ("+" + code + number).
 */
export const PHONE_COUNTRIES = [
  { code: "1", label: "+1 República Dominicana / EE. UU. / PR" },
  { code: "34", label: "+34 España" },
  { code: "44", label: "+44 Reino Unido" },
  { code: "39", label: "+39 Italia" },
  { code: "33", label: "+33 Francia" },
  { code: "49", label: "+49 Alemania" },
  { code: "52", label: "+52 México" },
  { code: "57", label: "+57 Colombia" },
  { code: "58", label: "+58 Venezuela" },
  { code: "503", label: "+503 El Salvador" },
] as const;

export const DEFAULT_PHONE_COUNTRY = "1";

/**
 * Builds the value the normalizer checks. If the local field already starts with "+",
 * the user typed a full international number, so it is used as it is.
 */
export function composePhone(country: string, local: string): string {
  const trimmed = local.trim();
  if (trimmed.startsWith("+")) return trimmed;
  return `+${country}${trimmed.replace(/\D/g, "")}`;
}

/** Longest known calling code that prefixes the digits, or null. */
export function countryCodeOf(digits: string): string | null {
  const codes = PHONE_COUNTRIES.map((c) => c.code).sort((a, b) => b.length - a.length);
  return codes.find((code) => digits.startsWith(code)) ?? null;
}
