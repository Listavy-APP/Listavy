/**
 * Privacy scrubbing for Sentry events. Errors must never carry personal data:
 * no emails, no phone numbers, no message or job text, no query strings, no user objects.
 * Pure functions, no I/O.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 7+ digits, optionally with +, spaces, dashes, dots or parentheses. Catches local and E.164 forms.
const PHONE = /\+?\d[\d\s().-]{6,}\d/g;

export const REDACTED = "[redacted]";

export function scrubText(value: string): string {
  return value.replace(EMAIL, REDACTED).replace(PHONE, REDACTED);
}

/** Keeps the URL path only. Drops query strings and fragments, which can carry tokens or ids. */
export function scrubUrl(value: string): string {
  try {
    const url = new URL(value, "https://listavy.invalid");
    return `${url.origin === "https://listavy.invalid" ? "" : url.origin}${url.pathname}`;
  } catch {
    return REDACTED;
  }
}

/** Recursively scrubs every string inside a plain object or array. Returns a new value. */
export function scrubDeep<T>(value: T, depth = 0): T {
  if (depth > 8) return REDACTED as unknown as T;
  if (typeof value === "string") return scrubText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubDeep(v, depth + 1);
    }
    return out as T;
  }
  return value;
}
