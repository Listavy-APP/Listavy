// Payment provider interface. Job and payment flows call only these methods.
// A provider adapter owns its own API, webhook format, and metadata keys. Adding a provider means
// writing an adapter, adding it to providerFor(), and extending the provider check in migration 0023.
// No flow changes.
// Pure TypeScript: no Deno globals, no npm imports, so the adapters can be tested under Node.

import { createStripeProvider } from "./stripe.ts";

export type ProviderId = "stripe";
export type Currency = "USD" | "DOP";

export type CheckoutInput = {
  jobId: string;
  purpose: "job" | "diagnostic";
  productName: string;
  amountMinor: number; // in the provider's currency, minor units
  currency: Currency;
  fx: number;
  amountDop: number; // charged total in DOP, including any tip
  commissionDop: number;
  proPayoutDop: number; // includes any tip
  tipDop: number; // 0 when there is no tip; sent to the webhook as metadata
  successUrl: string;
  cancelUrl: string;
};

export type BoostCheckoutInput = {
  proId: string;
  durationDays: 7 | 30;
  amountDop: number;
  amountMinor: number;
  currency: Currency;
  fx: number;
  productName: string;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutCreated = { url: string; sessionId: string };

// A paid job checkout, normalized from a provider webhook.
export type CheckoutEvent = {
  eventId: string;
  eventType: string;
  livemode: boolean;
  jobId: string;
  purpose: string;
  providerRef: string; // checkout session id
  paymentRef: string | null; // provider payment reference (Stripe: payment intent id)
  amountMinor: number;
  fx: number;
  amountDop: number;
  commissionDop: number;
  proPayoutDop: number;
  tipDop: number;
};

/** A paid profile boost. Separate from job payments: no job id, no transfer, no release. */
export type BoostEvent = {
  eventId: string;
  eventType: string;
  livemode: boolean;
  proId: string;
  providerRef: string;
  paymentRef: string | null;
  durationDays: number;
  amountDop: number;
  amountMinor: number;
  fx: number;
};

export type WebhookResult =
  | { kind: "invalid" }
  | { kind: "ignored"; reason: string }
  | { kind: "pending" }
  | { kind: "checkout"; event: CheckoutEvent }
  | { kind: "boost"; event: BoostEvent };

export type TransferInput = {
  paymentId: string;
  jobId: string;
  chargeId: string;
  destination: string; // the pro's account at the provider
  amountMinor: number;
  currency: Currency;
  idempotencyKey: string;
};

export type RefundInput = {
  refundId: string;
  paymentRef: string;
  amountMinor: number;
  currency: Currency;
  idempotencyKey: string;
};

export interface PaymentProvider {
  readonly id: ProviderId;
  readonly currency: Currency;

  /** Starts a hosted checkout for one job payment. */
  createCheckout(input: CheckoutInput): Promise<CheckoutCreated>;

  /** Starts a hosted checkout for a paid profile boost. No job, no transfer. */
  createBoostCheckout(input: BoostCheckoutInput): Promise<CheckoutCreated>;

  /** Verifies the webhook signature from the request headers and normalizes the event. Throws only on infrastructure errors. */
  verifyWebhook(raw: string, headers: Headers): Promise<WebhookResult>;

  /** Resolves the charge id that a transfer must reference. */
  chargeIdFor(paymentRef: string): Promise<string>;

  /** Returns the id of a transfer already made for this payment, or null. Makes a retry safe after the idempotency key expires. */
  findTransfer(jobId: string, paymentId: string): Promise<string | null>;

  /** Moves the pro's share to the pro's account. Returns the transfer id. */
  createTransfer(input: TransferInput): Promise<string>;

  /** Returns the id of a refund already made for this refund row, or null. */
  findRefund(paymentRef: string, refundId: string): Promise<string | null>;

  /** Refunds the payer. Returns the refund id. */
  createRefund(input: RefundInput): Promise<string>;
}

export type ProviderConfig = {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  fetch?: typeof fetch;
};

/** Looks up a provider by the id stored on a job or payment. Throws for an unknown id. */
export function providerFor(id: string, config: ProviderConfig): PaymentProvider {
  switch (id) {
    case "stripe":
      return createStripeProvider({
        secretKey: config.stripeSecretKey,
        webhookSecret: config.stripeWebhookSecret,
        fetch: config.fetch,
      });
    default:
      throw new Error(`Proveedor de pago desconocido: ${id}`);
  }
}
