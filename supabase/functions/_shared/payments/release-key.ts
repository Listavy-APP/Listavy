// Idempotency rules for pro payout transfers (queue item 2).
// Pure TypeScript: no Deno globals, no npm imports, so it runs under Node tests.
//
// Stripe caches a request's result under its Idempotency-Key for 24h+, including failures.
// A confirmed refusal (Stripe processed the request and created no transfer) therefore must
// not be retried under the same key. Every other outcome (timeout, 5xx, 409, 429, network error)
// is unknown, so the same key stays and a double payout stays impossible.

/** Version 1 keeps the original key, so transfers already in flight are unaffected. */
export function releaseKey(paymentId: string, version: number): string {
  if (!Number.isInteger(version) || version < 1) throw new Error("La versión de la clave debe ser 1 o más.");
  return version === 1 ? `release_${paymentId}` : `release_${paymentId}_v${version}`;
}

/** True only for an error Stripe returned as a definitive refusal. */
export function isConfirmedRejection(err: unknown): boolean {
  return (err as { kind?: string } | null)?.kind === "rejected";
}

/** Maps an HTTP status from Stripe to the outcome kind. 409 and 429 are not confirmed refusals. */
export function stripeErrorKind(status: number): "rejected" | "unknown" {
  if (status === 409 || status === 429) return "unknown";
  return status >= 400 && status < 500 ? "rejected" : "unknown";
}
