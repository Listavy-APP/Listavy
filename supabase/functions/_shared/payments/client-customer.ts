// Get-or-create the Stripe Customer for a client. Pure: storage and Stripe are injected, so the race
// rules run under Node tests without a network.
//
// Race rules:
//   1. The Stripe create carries a deterministic idempotency key (client, mode). Double-clicks and
//      retries inside Stripe's 24-hour window return the same customer.
//   2. The row insert is "insert if absent". The stored id is the winner. Every caller returns the winner.
//   3. A customer created by a caller that lost step 2 is deleted, so it cannot hold a card.
// Known gap: if the insert fails after Stripe created a customer, the customer has no row. It holds no
// card, and a later retry stores a new one. Deleting it needs a cleanup job, not in this item.

export type CustomerDeps = {
  mode: "test" | "live";
  findStored(profileId: string, mode: "test" | "live"): Promise<string | null>;
  createCustomer(input: { profileId: string; idempotencyKey: string }): Promise<string>;
  /** Stores the id if no row exists for (profile, mode). Returns the id that is stored afterwards. */
  storeIfAbsent(profileId: string, mode: "test" | "live", customerId: string): Promise<string>;
  deleteCustomer(customerId: string): Promise<void>;
};

export async function ensureClientCustomer(deps: CustomerDeps, profileId: string): Promise<string> {
  const existing = await deps.findStored(profileId, deps.mode);
  if (existing) return existing;

  const created = await deps.createCustomer({
    profileId,
    idempotencyKey: `client-customer:${profileId}:${deps.mode}`,
  });
  const stored = await deps.storeIfAbsent(profileId, deps.mode, created);
  if (stored !== created) {
    // Lost the race. Remove our duplicate so no card can be saved to it. Cleanup failure is not fatal:
    // the caller still gets the stored customer, and the orphan holds no payment method.
    await deps.deleteCustomer(created).catch(() => undefined);
  }
  return stored;
}
