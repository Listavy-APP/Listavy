/**
 * Returns the post-login destination if it is a same-site relative path, else "/cuenta".
 * Rejects absolute URLs, protocol-relative ("//host") and backslash tricks.
 */
export function safeNext(raw: string | null | undefined, fallback = "/cuenta"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}
