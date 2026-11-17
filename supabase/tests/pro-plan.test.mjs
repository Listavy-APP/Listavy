// Pro plan subscription: checkout body and webhook normalization. No network. Test mode only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createStripeProvider } from "../functions/_shared/payments/stripe.ts";

const SECRET = "whsec_test_secret";

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, body: init.body });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch: " + url);
    return { ok: true, status: 200, json: async () => next };
  };
  return { fn, calls };
}

const provider = (responses = []) => {
  const f = fakeFetch(responses);
  return { p: createStripeProvider({ secretKey: "sk_test_x", webhookSecret: SECRET, fetch: f.fn }), calls: f.calls };
};
const verify = (p, raw, sig) => p.verifyWebhook(raw, new Headers({ "stripe-signature": sig }));
const signed = (raw, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac("sha256", SECRET).update(`${t}.${raw}`).digest("hex")}`;
const evt = (id, type, object) => JSON.stringify({ id, type, livemode: false, data: { object } });

const planInput = {
  proId: "pro-1",
  amountDop: 2950,
  amountMinor: 4917,
  currency: "USD",
  fx: 60,
  productName: "Plan Pro mensual (prueba)",
  successUrl: "https://app.test/pro/estado?plan=ok",
  cancelUrl: "https://app.test/pro/estado?plan=cancelado",
};

const meta = { purpose: "pro_plan", pro_id: "pro-1", amount_dop: "2950", amount_minor: "4917", fx: "60" };

test("checkout: subscription mode, monthly recurring, no job fields, metadata on session and subscription", async () => {
  const { p, calls } = provider([{ url: "https://checkout.test/s", id: "cs_1" }]);
  const r = await p.createProPlanCheckout(planInput);
  assert.equal(r.sessionId, "cs_1");
  const body = new URLSearchParams(calls[0].body);
  assert.equal(body.get("mode"), "subscription");
  assert.equal(body.get("line_items[0][price_data][recurring][interval]"), "month");
  assert.equal(body.get("line_items[0][price_data][unit_amount]"), "4917");
  assert.equal(body.get("metadata[purpose]"), "pro_plan");
  assert.equal(body.get("metadata[job_id]"), null);
  assert.equal(body.get("subscription_data[metadata][purpose]"), "pro_plan");
  assert.equal(body.get("subscription_data[metadata][pro_id]"), "pro-1");
  assert.equal(body.get("subscription_data[metadata][amount_dop]"), "2950");
});

test("webhook: paid subscription checkout normalizes to kind activated", async () => {
  const { p } = provider();
  const raw = evt("evt_a", "checkout.session.completed", {
    id: "cs_1", mode: "subscription", payment_status: "paid", subscription: "sub_1", metadata: meta,
  });
  const r = await verify(p, raw, signed(raw));
  assert.equal(r.kind, "pro_plan");
  assert.deepEqual(r.event, {
    eventId: "evt_a", eventType: "checkout.session.completed", livemode: false, kind: "activated",
    proId: "pro-1", subscriptionId: "sub_1", invoiceId: null, periodEnd: null,
    amountDop: 2950, amountMinor: 4917, fx: 60,
  });
});

test("webhook: unpaid subscription checkout is pending, not activated", async () => {
  const { p } = provider();
  const raw = evt("evt_b", "checkout.session.completed", {
    id: "cs_2", mode: "subscription", payment_status: "unpaid", subscription: "sub_1", metadata: meta,
  });
  assert.equal((await verify(p, raw, signed(raw))).kind, "pending");
});

test("webhook: paid invoice normalizes to kind paid with the period end from the line", async () => {
  const { p } = provider();
  const raw = evt("evt_c", "invoice.paid", {
    id: "in_1", amount_paid: 4917,
    parent: { type: "subscription_details", subscription_details: { subscription: "sub_1", metadata: meta } },
    lines: { data: [{ period: { start: 1800000000, end: 1802592000 } }] },
  });
  const r = await verify(p, raw, signed(raw));
  assert.equal(r.kind, "pro_plan");
  assert.equal(r.event.kind, "paid");
  assert.equal(r.event.invoiceId, "in_1");
  assert.equal(r.event.periodEnd, new Date(1802592000 * 1000).toISOString());
  assert.equal(r.event.amountDop, 2950);
});

test("webhook: subscription deleted normalizes to kind ended", async () => {
  const { p } = provider();
  const raw = evt("evt_d", "customer.subscription.deleted", { id: "sub_1", metadata: meta });
  const r = await verify(p, raw, signed(raw));
  assert.equal(r.kind, "pro_plan");
  assert.equal(r.event.kind, "ended");
  assert.equal(r.event.subscriptionId, "sub_1");
});

test("webhook: invoice without the pro_plan purpose is ignored, not routed to pro plan", async () => {
  const { p } = provider();
  const raw = evt("evt_e", "invoice.paid", { id: "in_2", parent: { subscription_details: { metadata: {} } }, lines: { data: [] } });
  assert.equal((await verify(p, raw, signed(raw))).kind, "ignored");
});

test("webhook: a job checkout still normalizes to kind checkout (regression)", async () => {
  const { p } = provider();
  const raw = evt("evt_f", "checkout.session.completed", {
    id: "cs_job", mode: "payment", payment_status: "paid", payment_intent: "pi_1",
    metadata: { job_id: "job-1", purpose: "job", amount_minor: "2000", fx: "60", amount_dop: "1200",
      commission_dop: "400", pro_payout_dop: "800", tip_dop: "0" },
  });
  assert.equal((await verify(p, raw, signed(raw))).kind, "checkout");
});

test("webhook: a bad signature is still rejected before any Pro plan routing", async () => {
  const { p } = provider();
  const raw = evt("evt_g", "invoice.paid", { id: "in_3", parent: { subscription_details: { subscription: "sub_1", metadata: meta } }, lines: { data: [] } });
  assert.equal((await verify(p, raw, "t=1,v1=bad")).kind, "invalid");
});

test("portal: customer id is read from the subscription with a GET", async () => {
  const { p, calls } = provider([{ id: "sub_1", customer: "cus_123" }]);
  assert.equal(await p.getSubscriptionCustomerId("sub_1"), "cus_123");
  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /\/v1\/subscriptions\/sub_1$/);
});

test("portal: a subscription without a customer is an error, not a guess", async () => {
  const { p } = provider([{ id: "sub_2", customer: null }]);
  await assert.rejects(() => p.getSubscriptionCustomerId("sub_2"), /no tiene cliente/);
});

test("portal: session is created for the customer with the return URL", async () => {
  const { p, calls } = provider([{ url: "https://billing.stripe.test/p/session_1" }]);
  const r = await p.createPortalSession({ customerId: "cus_123", returnUrl: "https://app.test/pro/estado" });
  assert.equal(r.url, "https://billing.stripe.test/p/session_1");
  const body = new URLSearchParams(calls[0].body);
  assert.equal(calls[0].url, "https://api.stripe.com/v1/billing_portal/sessions");
  assert.equal(body.get("customer"), "cus_123");
  assert.equal(body.get("return_url"), "https://app.test/pro/estado");
});

test("webhook: real Stripe invoice.paid shape (parent.subscription_details) normalizes to kind paid", async () => {
  // Shape from a live test-mode event (invoice in_1UctDLD..., sub sub_1UctDND...). Regression: the code
  // previously read top-level subscription_details and ignored every invoice.
  const { p } = provider();
  const raw = evt("evt_live", "invoice.paid", {
    id: "in_1UctDLDnvNOJYubBLynfM4w8", object: "invoice", status: "paid", amount_paid: 4917,
    parent: { quote_details: null, type: "subscription_details",
      subscription_details: { metadata: meta, subscription: "sub_1UctDNDnvNOJYubBDJDlwyzH" } },
    lines: { object: "list", data: [{ period: { start: 1794948171, end: 1797540171 } }] },
  });
  const r = await verify(p, raw, signed(raw));
  assert.equal(r.kind, "pro_plan");
  assert.equal(r.event.kind, "paid");
  assert.equal(r.event.subscriptionId, "sub_1UctDNDnvNOJYubBDJDlwyzH");
  assert.equal(r.event.invoiceId, "in_1UctDLDnvNOJYubBLynfM4w8");
  assert.equal(r.event.proId, "pro-1");
});
