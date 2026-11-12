// Stripe adapter for the PaymentProvider interface. Holds every Stripe-specific detail: API paths,
// form fields, metadata keys, and the webhook signature format. Request bodies and idempotency
// behavior match the functions this replaced.

import { findTransferForPayment } from "./transfer-lookup.ts";
import type {
  CheckoutCreated,
  CheckoutEvent,
  CheckoutInput,
  PaymentProvider,
  RefundInput,
  TransferInput,
  WebhookResult,
} from "./provider.ts";

const TOLERANCE_SECONDS = 300;
const enc = new TextEncoder();

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  fetch?: typeof fetch;
};

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>]. Signed payload is "<t>.<raw body>".
async function signatureValid(raw: string, header: string, secret: string, nowSeconds: number): Promise<boolean> {
  let t = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") t = v ?? "";
    if (k === "v1" && v) sigs.push(v);
  }
  if (!t || sigs.length === 0) return false;
  const age = Math.abs(Math.floor(nowSeconds) - Number(t));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(t + "." + raw));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => constantTimeEqual(s, expected));
}

export function createStripeProvider(config: StripeConfig): PaymentProvider {
  const doFetch = config.fetch ?? fetch;

  async function api(method: "GET" | "POST", path: string, body?: URLSearchParams, extra: Record<string, string> = {}) {
    const res = await doFetch("https://api.stripe.com" + path, {
      method,
      headers: { Authorization: "Bearer " + config.secretKey, "Content-Type": "application/x-www-form-urlencoded", ...extra },
      body: body?.toString(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? "Error de Stripe.");
    return data;
  }

  return {
    id: "stripe",
    currency: "USD",

    async createCheckout(input: CheckoutInput): Promise<CheckoutCreated> {
      const params = new URLSearchParams({
        mode: "payment",
        currency: input.currency.toLowerCase(),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.jobId,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": input.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(input.amountMinor),
        "line_items[0][price_data][product_data][name]": input.productName,
        "metadata[job_id]": input.jobId,
        "metadata[purpose]": input.purpose,
        "metadata[amount_dop]": String(input.amountDop),
        "metadata[commission_dop]": String(input.commissionDop),
        "metadata[pro_payout_dop]": String(input.proPayoutDop),
        "metadata[fx]": String(input.fx),
        "metadata[amount_minor]": String(input.amountMinor),
        "payment_intent_data[metadata][job_id]": input.jobId,
      });
      const session = await api("POST", "/v1/checkout/sessions", params);
      return { url: session.url, sessionId: session.id };
    },

    async verifyWebhook(raw: string, headers: Headers): Promise<WebhookResult> {
      const signature = headers.get("stripe-signature") ?? "";
      if (!(await signatureValid(raw, signature, config.webhookSecret, Date.now() / 1000))) {
        return { kind: "invalid" };
      }
      const event = JSON.parse(raw);
      if (event.type !== "checkout.session.completed") {
        return { kind: "ignored", reason: event.type };
      }
      const session = event.data.object;
      if (session.payment_status !== "paid") return { kind: "pending" };
      const m = session.metadata ?? {};
      if (!m.job_id || !m.purpose) return { kind: "ignored", reason: "no job metadata" };

      const normalized: CheckoutEvent = {
        eventId: event.id,
        eventType: event.type,
        livemode: event.livemode,
        jobId: m.job_id,
        purpose: m.purpose,
        providerRef: session.id,
        paymentRef: session.payment_intent ?? null,
        amountMinor: Number(m.amount_minor),
        fx: Number(m.fx),
        amountDop: Number(m.amount_dop),
        commissionDop: Number(m.commission_dop),
        proPayoutDop: Number(m.pro_payout_dop),
      };
      return { kind: "checkout", event: normalized };
    },

    async chargeIdFor(paymentRef: string): Promise<string> {
      const pi = await api("GET", `/v1/payment_intents/${paymentRef}`);
      const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;
      if (!chargeId) throw new Error("El pago no tiene cargo.");
      return chargeId;
    },

    async findTransfer(jobId: string, paymentId: string): Promise<string | null> {
      const listed = await api("GET", `/v1/transfers?transfer_group=${encodeURIComponent(jobId)}&limit=100`);
      return findTransferForPayment(listed.data ?? [], paymentId)?.id ?? null;
    },

    async createTransfer(input: TransferInput): Promise<string> {
      const params = new URLSearchParams({
        amount: String(input.amountMinor),
        currency: input.currency.toLowerCase(),
        destination: input.destination,
        source_transaction: input.chargeId,
        transfer_group: input.jobId,
        "metadata[payment_id]": input.paymentId,
      });
      const created = await api("POST", "/v1/transfers", params, { "Idempotency-Key": input.idempotencyKey });
      return created.id;
    },

    async findRefund(paymentRef: string, refundId: string): Promise<string | null> {
      const listed = await api("GET", `/v1/refunds?payment_intent=${encodeURIComponent(paymentRef)}&limit=100`);
      const existing = (listed.data ?? []).find(
        (x: { metadata?: Record<string, string>; status?: string }) =>
          x.metadata?.refund_id === refundId && x.status !== "failed" && x.status !== "canceled",
      );
      return existing?.id ?? null;
    },

    async createRefund(input: RefundInput): Promise<string> {
      const params = new URLSearchParams({
        payment_intent: input.paymentRef,
        amount: String(input.amountMinor),
        "metadata[refund_id]": input.refundId,
      });
      const created = await api("POST", "/v1/refunds", params, { "Idempotency-Key": input.idempotencyKey });
      return created.id;
    },
  };
}
