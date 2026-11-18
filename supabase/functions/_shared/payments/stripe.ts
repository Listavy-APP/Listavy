// Stripe adapter for the PaymentProvider interface. Holds every Stripe-specific detail: API paths,
// form fields, metadata keys, and the webhook signature format. Request bodies and idempotency
// behavior match the functions this replaced.

import { findTransferForPayment } from "./transfer-lookup.ts";
import type {
  BoostCheckoutInput,
  BoostEvent,
  CheckoutCreated,
  CheckoutEvent,
  CheckoutInput,
  PaymentProvider,
  ProPlanCheckoutInput,
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

  async function api(method: "GET" | "POST" | "DELETE", path: string, body?: URLSearchParams, extra: Record<string, string> = {}) {
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
      const tipMetadata: Record<string, string> = input.tipDop > 0 ? { "metadata[tip_dop]": String(input.tipDop) } : {};
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
        ...tipMetadata,
      });
      const session = await api("POST", "/v1/checkout/sessions", params);
      return { url: session.url, sessionId: session.id };
    },

    async createBoostCheckout(input: BoostCheckoutInput): Promise<CheckoutCreated> {
      const params = new URLSearchParams({
        mode: "payment",
        currency: input.currency.toLowerCase(),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.proId,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": input.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(input.amountMinor),
        "line_items[0][price_data][product_data][name]": input.productName,
        "metadata[purpose]": "boost",
        "metadata[pro_id]": input.proId,
        "metadata[duration_days]": String(input.durationDays),
        "metadata[amount_dop]": String(input.amountDop),
        "metadata[amount_minor]": String(input.amountMinor),
        "metadata[fx]": String(input.fx),
      });
      const session = await api("POST", "/v1/checkout/sessions", params);
      return { url: session.url, sessionId: session.id };
    },

    async getSubscriptionCustomerId(subscriptionId: string): Promise<string> {
      const sub = await api("GET", "/v1/subscriptions/" + encodeURIComponent(subscriptionId));
      if (typeof sub.customer !== "string" || !sub.customer) throw new Error("La suscripción no tiene cliente.");
      return sub.customer;
    },

    async cancelProPlanSubscription(subscriptionId: string): Promise<"cancelled" | "already_cancelled"> {
      // Immediate cancel. No proration and no invoice, so the paid period is not refunded (decided policy).
      const params = new URLSearchParams({ prorate: "false", invoice_now: "false" });
      try {
        await api("DELETE", "/v1/subscriptions/" + encodeURIComponent(subscriptionId), params);
        return "cancelled";
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (/No such subscription|already canceled|already cancelled/i.test(msg)) return "already_cancelled";
        throw err;
      }
    },

    async createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
      const params = new URLSearchParams({ customer: input.customerId, return_url: input.returnUrl });
      const session = await api("POST", "/v1/billing_portal/sessions", params);
      return { url: session.url };
    },

    async createProPlanCheckout(input: ProPlanCheckoutInput): Promise<CheckoutCreated> {
      // Subscription mode: Stripe charges the first month now and renews monthly. No proration.
      const meta = {
        purpose: "pro_plan",
        pro_id: input.proId,
        amount_dop: String(input.amountDop),
        amount_minor: String(input.amountMinor),
        fx: String(input.fx),
      };
      const params = new URLSearchParams({
        mode: "subscription",
        currency: input.currency.toLowerCase(),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.proId,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": input.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(input.amountMinor),
        "line_items[0][price_data][recurring][interval]": "month",
        "line_items[0][price_data][product_data][name]": input.productName,
        "metadata[purpose]": meta.purpose,
        "metadata[pro_id]": meta.pro_id,
        "metadata[amount_dop]": meta.amount_dop,
        "metadata[amount_minor]": meta.amount_minor,
        "metadata[fx]": meta.fx,
        "subscription_data[metadata][purpose]": meta.purpose,
        "subscription_data[metadata][pro_id]": meta.pro_id,
        "subscription_data[metadata][amount_dop]": meta.amount_dop,
        "subscription_data[metadata][amount_minor]": meta.amount_minor,
        "subscription_data[metadata][fx]": meta.fx,
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
      const planResult = proPlanResult(event);
      if (planResult) return planResult;
      if (event.type !== "checkout.session.completed") {
        return { kind: "ignored", reason: event.type };
      }
      const session = event.data.object;
      if (session.payment_status !== "paid") return { kind: "pending" };
      const m = session.metadata ?? {};
      if (m.purpose === "boost") {
        if (!m.pro_id) return { kind: "ignored", reason: "no pro metadata" };
        const boost: BoostEvent = {
          eventId: event.id,
          eventType: event.type,
          livemode: event.livemode,
          proId: m.pro_id,
          providerRef: session.id,
          paymentRef: session.payment_intent ?? null,
          durationDays: Number(m.duration_days),
          amountDop: Number(m.amount_dop),
          amountMinor: Number(m.amount_minor),
          fx: Number(m.fx),
        };
        return { kind: "boost", event: boost };
      }
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
        tipDop: Number(m.tip_dop ?? 0),
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
      // With a charge, the transfer waits on that charge. Without one, it uses the platform balance.
      const chargeLink: [string, string][] = input.chargeId ? [["source_transaction", input.chargeId]] : [];
      const params = new URLSearchParams([
        ["amount", String(input.amountMinor)],
        ["currency", input.currency.toLowerCase()],
        ["destination", input.destination],
        ...chargeLink,
        ["transfer_group", input.jobId],
        ["metadata[payment_id]", input.paymentId],
      ]);
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

/**
 * Pro plan subscription events. Returns null for everything else so the caller keeps its existing path.
 * "pending" is returned as { kind: "pending" } when a first checkout is not yet paid.
 */
/** Stripe event body after JSON.parse. Only the fields the pro plan path reads are typed. */
type StripeEvent = {
  id?: string;
  type: string;
  livemode?: boolean;
  data?: { object?: StripeEventObject };
};

type StripeEventObject = {
  id?: string;
  mode?: string;
  payment_status?: string;
  subscription?: string;
  metadata?: Record<string, string>;
  parent?: { subscription_details?: { metadata?: Record<string, string>; subscription?: string } | null } | null;
  lines?: { data?: { period?: { end?: number } }[] };
  amount_paid?: number;
};

function proPlanResult(event: StripeEvent): WebhookResult | null {
  const obj: StripeEventObject = event.data?.object ?? {};
  // Invoices carry subscription details under parent.subscription_details (Stripe API 2025-06-30+).
  const invoiceSub: { metadata?: Record<string, string>; subscription?: string } = obj.parent?.subscription_details ?? {};
  const isPlanSubscription = event.type === "checkout.session.completed"
    ? obj.mode === "subscription" && obj.metadata?.purpose === "pro_plan"
    : event.type === "invoice.paid"
      ? invoiceSub.metadata?.purpose === "pro_plan"
      : event.type === "customer.subscription.deleted"
        ? obj.metadata?.purpose === "pro_plan"
        : false;
  if (!isPlanSubscription) return null;

  if (event.type === "checkout.session.completed") {
    if (obj.payment_status !== "paid") return { kind: "pending" };
    return planEvent(event, "activated", obj.metadata, obj.subscription, null, null, 0);
  }
  if (event.type === "invoice.paid") {
    const periodEnd = obj.lines?.data?.[0]?.period?.end;
    return planEvent(
      event,
      "paid",
      invoiceSub.metadata,
      invoiceSub.subscription,
      obj.id,
      periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      Number(obj.amount_paid ?? 0),
    );
  }
  return planEvent(event, "ended", obj.metadata, obj.id, null, null, 0);
}

function planEvent(
  event: StripeEvent,
  kind: "activated" | "paid" | "ended",
  m: Record<string, string> | undefined,
  subscriptionId: string,
  invoiceId: string | null,
  periodEnd: string | null,
  amountPaidMinor: number,
): WebhookResult {
  if (!m?.pro_id) return { kind: "ignored", reason: "no pro metadata" };
  return {
    kind: "pro_plan",
    event: {
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
      kind,
      proId: m.pro_id,
      subscriptionId,
      invoiceId,
      periodEnd,
      amountDop: Number(m.amount_dop ?? 0),
      amountMinor: Number(m.amount_minor ?? 0),
      amountPaidMinor,
      fx: Number(m.fx ?? 0),
    },
  };
}
