import { countryCodeOf } from "@/lib/domain/countries";

/**
 * Display-only phone format. Stored values are not changed.
 * "16469442277" -> "+1 646 944 2277". Known non-NANP codes: "34600123456" -> "+34 600 123 456".
 * Anything else is shown as stored.
 */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  const code = countryCodeOf(digits);
  if (code && code !== "1") {
    const local = digits.slice(code.length);
    const groups = local.match(/.{1,3}/g) ?? [];
    return `+${code} ${groups.join(" ")}`;
  }
  return raw;
}
