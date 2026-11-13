/**
 * Display-only phone format. Stored values are not changed (normalization is a separate data task).
 * "16469442277" -> "+1 646 944 2277". Anything else is shown as stored.
 */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return raw;
}
