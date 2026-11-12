// Finds a transfer already made for a payment. Used before creating one, so a retry
// cannot pay twice, even after Stripe has expired the idempotency key (about 24 h).
// Pure: no I/O, no imports.

export type TransferLike = {
  id: string;
  metadata?: Record<string, string> | null;
};

export function findTransferForPayment(transfers: TransferLike[], paymentId: string): TransferLike | null {
  return transfers.find((t) => t.metadata?.payment_id === paymentId) ?? null;
}
