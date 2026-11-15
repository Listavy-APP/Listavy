/**
 * Country calling codes offered at sign-in and phone change. Common for Listavy's clients
 * (Dominican Republic, US, Puerto Rico, Spain, UK, and diaspora countries). Not a full list.
 * Codes are digits only; the stored phone is E.164 ("+" + code + number).
 */
/**
 * digits: allowed count of local digits (after the country code, no trunk 0).
 * placeholder: example shown in the number field for that country.
 */
export const PHONE_COUNTRIES = [
  { code: "1", label: "+1 República Dominicana / EE. UU. / PR", digits: [10, 10], placeholder: "809 555 1234" },
  { code: "34", label: "+34 España", digits: [9, 9], placeholder: "600 123 456" },
  { code: "44", label: "+44 Reino Unido", digits: [10, 10], placeholder: "7700 900123" },
  { code: "39", label: "+39 Italia", digits: [9, 10], placeholder: "312 345 6789" },
  { code: "33", label: "+33 Francia", digits: [9, 9], placeholder: "6 12 34 56 78" },
  { code: "49", label: "+49 Alemania", digits: [10, 11], placeholder: "1512 3456789" },
  { code: "52", label: "+52 México", digits: [10, 10], placeholder: "55 1234 5678" },
  { code: "57", label: "+57 Colombia", digits: [10, 10], placeholder: "300 123 4567" },
  { code: "58", label: "+58 Venezuela", digits: [10, 10], placeholder: "412 123 4567" },
  { code: "503", label: "+503 El Salvador", digits: [8, 8], placeholder: "7012 3456" },
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

/**
 * Checks the local digit count for the selected country. Returns a Spanish message, or null when
 * the count is fine. A value that starts with "+" is a full number: its country is read from it.
 */
export function phoneLengthError(country: string, local: string): string | null {
  const trimmed = local.trim();
  if (trimmed.startsWith("+")) return null;
  const digits = trimmed.replace(/\D/g, "").length;
  const entry = PHONE_COUNTRIES.find((c) => c.code === country);
  if (!entry) return null;
  const [min, max] = entry.digits;
  if (digits >= min && digits <= max) return null;
  const expected = min === max ? `${min}` : `${min} o ${max}`;
  return `El número para +${country} debe tener ${expected} dígitos. Revisa el número.`;
}

/** Placeholder for the selected country's number field. */
export function phonePlaceholder(country: string): string {
  return PHONE_COUNTRIES.find((c) => c.code === country)?.placeholder ?? "";
}
