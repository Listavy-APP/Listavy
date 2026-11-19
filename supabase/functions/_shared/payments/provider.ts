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
  /** Stripe Customer for the client. When set, Checkout offers saved cards. */
  customerId?: string;
  /** Save the card paid with for later reuse. Only meaningful with customerId. False when the customer already has a card. */
  saveCard?: boolean;
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

/** Pro plan: monthly subscription, RD$2,950. Subscription mode, no proration, no refund of a paid period. */
export type ProPlanCheckoutInput = {
  proId: string;
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

/** Pro plan events. kind: "activated" (first checkout), "paid" (each invoice), "ended" (subscription deleted). */
export type ProPlanEvent = {
  eventId: string;
  eventType: string;
  livemode: boolean;
  kind: "activated" | "paid" | "ended";
  proId: string;
  subscriptionId: string;
  invoiceId: string | null;
  periodEnd: string | null; // ISO timestamp, from the invoice line
  amountDop: number; // plan price in DOP, from metadata
  amountMinor: number; // plan price in USD minor units, from metadata
  amountPaidMinor: number; // what Stripe actually charged on this invoice (0 for proration-only invoices)
  fx: number;
};

export type WebhookResult =
  | { kind: "invalid" }
  | { kind: "ignored"; reason: string }
  | { kind: "pending" }
  | { kind: "checkout"; event: CheckoutEvent }
  | { kind: "boost"; event: BoostEvent }
  | { kind: "pro_plan"; event: ProPlanEvent };

export type TransferInput = {
  paymentId: string;
  jobId: string;
  /** Omit to fund the transfer from the platform balance (referral discounts). */
  chargeId?: string;
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

  /** Returns the Stripe customer id for a plan subscription. */
  getSubscriptionCustomerId(subscriptionId: string): Promise<string>;

  /** Starts a Stripe Customer Portal session where the pro can manage or cancel the plan. */
  createPortalSession(input: { customerId: string; returnUrl: string; configurationId?: string }): Promise<{ url: string }>;

  /** Creates a Stripe Customer for a client. The idempotency key makes a retry return the same customer. */
  createCustomer(input: { profileId: string; idempotencyKey: string }): Promise<string>;

  /** Deletes a Stripe Customer that holds no payment method. Used only for a duplicate created by a lost race. */
  deleteCustomer(customerId: string): Promise<void>;
  /** True when the customer already has at least one saved card. */
  hasReusableCard(customerId: string): Promise<boolean>;

  /** Starts a hosted subscription checkout for the Pro plan. */
  createProPlanCheckout(input: ProPlanCheckoutInput): Promise<CheckoutCreated>;

  /**
   * Cancels a Pro plan subscription now. No proration, no invoice, no refund of the period already paid.
   * Returns "already_cancelled" when the subscription was already cancelled, so a retry is safe.
   */
  cancelProPlanSubscription(subscriptionId: string): Promise<"cancelled" | "already_cancelled">;

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
