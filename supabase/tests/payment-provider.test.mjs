// Run: node --experimental-strip-types --test supabase/tests/payment-provider.test.mjs
// Tests the Stripe adapter against a fake fetch. No network. The checkout body is compared byte for byte
// with the body the stripe-checkout function built before the provider interface existed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createStripeProvider } from "../functions/_shared/payments/stripe.ts";
import { providerFor } from "../functions/_shared/payments/provider.ts";

const SECRET = "whsec_test_secret";

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers ?? {}, body: init.body });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch: " + url);
    return { ok: next.status === undefined ? true : next.status < 400, status: next.status ?? 200, json: async () => next.data };
  };
  return { fn, calls };
}

function provider(responses = []) {
  const f = fakeFetch(responses);
  const p = createStripeProvider({ secretKey: "sk_test_x", webhookSecret: SECRET, fetch: f.fn });
  return { p, calls: f.calls };
}

const verify = (p, raw, sig) => p.verifyWebhook(raw, new Headers({ "stripe-signature": sig }));

function signed(raw, t = Math.floor(Date.now() / 1000), secret = SECRET) {
  const sig = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return `t=${t},v1=${sig}`;
}

const checkoutInput = {
  jobId: "job-1",
  purpose: "job",
  productName: "Reparación Listavy (prueba)",
  amountMinor: 2000,
  currency: "USD",
  fx: 60,
  amountDop: 1200,
  commissionDop: 400,
  proPayoutDop: 800,
  tipDop: 0,
  successUrl: "https://app.test/trabajos/job-1?pago=ok",
  cancelUrl: "https://app.test/trabajos/job-1?pago=cancelado",
};

test("checkout: request body matches the body the function built before the interface", async () => {
  const { p, calls } = provider([{ data: { id: "cs_1", url: "https://checkout.stripe.test/cs_1" } }]);
  const out = await p.createCheckout(checkoutInput);
  assert.deepEqual(out, { url: "https://checkout.stripe.test/cs_1", sessionId: "cs_1" });
  assert.equal(calls[0].url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.Authorization, "Bearer sk_test_x");
  const expected = new URLSearchParams([
    ["mode", "payment"],
    ["currency", "usd"],
    ["success_url", checkoutInput.successUrl],
    ["cancel_url", checkoutInput.cancelUrl],
    ["client_reference_id", "job-1"],
    ["line_items[0][quantity]", "1"],
    ["line_items[0][price_data][currency]", "usd"],
    ["line_items[0][price_data][unit_amount]", "2000"],
    ["line_items[0][price_data][product_data][name]", "Reparación Listavy (prueba)"],
    ["metadata[job_id]", "job-1"],
    ["metadata[purpose]", "job"],
    ["metadata[amount_dop]", "1200"],
    ["metadata[commission_dop]", "400"],
    ["metadata[pro_payout_dop]", "800"],
    ["metadata[fx]", "60"],
    ["metadata[amount_minor]", "2000"],
    ["payment_intent_data[metadata][job_id]", "job-1"],
  ]).toString();
  assert.equal(calls[0].body, expected);
});

test("checkout: a Stripe error surfaces its message", async () => {
  const { p } = provider([{ status: 400, data: { error: { message: "Monto inválido." } } }]);
  await assert.rejects(p.createCheckout(checkoutInput), /Monto inválido/);
});

function checkoutEvent(overrides = {}) {
  const session = {
    id: "cs_1",
    payment_status: "paid",
    payment_intent: "pi_1",
    metadata: {
      job_id: "job-1",
      purpose: "job",
      amount_minor: "2000",
      fx: "60",
      amount_dop: "1200",
      commission_dop: "400",
      pro_payout_dop: "800",
    },
    ...overrides.session,
  };
  return JSON.stringify({ id: "evt_1", type: overrides.type ?? "checkout.session.completed", livemode: false, data: { object: session } });
}

test("webhook: a valid paid checkout normalizes to the fields the RPC expects", async () => {
  const { p } = provider();
  const raw = checkoutEvent();
  const r = await verify(p, raw, signed(raw));
  assert.equal(r.kind, "checkout");
  assert.deepEqual(r.event, {
    eventId: "evt_1",
    eventType: "checkout.session.completed",
    livemode: false,
    jobId: "job-1",
    purpose: "job",
    providerRef: "cs_1",
    paymentRef: "pi_1",
    amountMinor: 2000,
    fx: 60,
    amountDop: 1200,
    commissionDop: 400,
    proPayoutDop: 800,
    tipDop: 0,
  });
});

test("checkout: a tip is sent as metadata and nothing else changes", async () => {
  const { p, calls } = provider([{ data: { id: "cs_t", url: "https://checkout.stripe.test/cs_t" } }]);
  await p.createCheckout({ ...checkoutInput, amountMinor: 2500, amountDop: 1500, proPayoutDop: 1100, tipDop: 300 });
  const body = new URLSearchParams(calls[0].body);
  assert.equal(body.get("metadata[tip_dop]"), "300");
  assert.equal(body.get("metadata[amount_dop]"), "1500");
  assert.equal(body.get("metadata[commission_dop]"), "400");
  assert.equal(body.get("metadata[pro_payout_dop]"), "1100");
  assert.equal(body.get("line_items[0][price_data][unit_amount]"), "2500");
});

test("webhook: a tip in metadata normalizes to tipDop", async () => {
  const { p } = provider();
  const session = {
    id: "cs_1",
    payment_status: "paid",
    payment_intent: "pi_1",
    metadata: {
      job_id: "job-1",
      purpose: "job",
      amount_minor: "2500",
      fx: "60",
      amount_dop: "1500",
      commission_dop: "400",
      pro_payout_dop: "1100",
      tip_dop: "300",
    },
  };
  const raw = JSON.stringify({ id: "evt_2", type: "checkout.session.completed", livemode: false, data: { object: session } });
  const r = await verify(p, raw, signed(raw));
  assert.equal(r.kind, "checkout");
  assert.equal(r.event.tipDop, 300);
  assert.equal(r.event.amountDop, 1500);
});

test("webhook: a wrong secret is invalid", async () => {
  const { p } = provider();
  const raw = checkoutEvent();
  assert.equal((await verify(p, raw, signed(raw, undefined, "whsec_other"))).kind, "invalid");
});

test("webhook: a tampered body is invalid", async () => {
  const { p } = provider();
  const raw = checkoutEvent();
  const header = signed(raw);
  assert.equal((await verify(p, raw.replace("1200", "1"), header)).kind, "invalid");
});

test("webhook: a timestamp older than five minutes is invalid", async () => {
  const { p } = provider();
  const raw = checkoutEvent();
  const old = Math.floor(Date.now() / 1000) - 600;
  assert.equal((await verify(p, raw, signed(raw, old))).kind, "invalid");
});

test("webhook: a missing header is invalid", async () => {
  const { p } = provider();
  assert.equal((await verify(p, checkoutEvent(), "")).kind, "invalid");
});

test("webhook: other event types are ignored with their type as the reason", async () => {
  const { p } = provider();
  const raw = checkoutEvent({ type: "charge.succeeded" });
  assert.deepEqual(await verify(p, raw, signed(raw)), { kind: "ignored", reason: "charge.succeeded" });
});

test("webhook: an unpaid session is pending", async () => {
  const { p } = provider();
  const raw = checkoutEvent({ session: { payment_status: "unpaid" } });
  assert.deepEqual(await verify(p, raw, signed(raw)), { kind: "pending" });
});

test("webhook: a session without job metadata is ignored", async () => {
  const { p } = provider();
  const raw = checkoutEvent({ session: { metadata: {} } });
  assert.deepEqual(await verify(p, raw, signed(raw)), { kind: "ignored", reason: "no job metadata" });
});

test("chargeIdFor: reads the charge from a string or an expanded object", async () => {
  const a = provider([{ data: { latest_charge: "ch_1" } }]);
  assert.equal(await a.p.chargeIdFor("pi_1"), "ch_1");
  assert.equal(a.calls[0].url, "https://api.stripe.com/v1/payment_intents/pi_1");
  const b = provider([{ data: { latest_charge: { id: "ch_2" } } }]);
  assert.equal(await b.p.chargeIdFor("pi_1"), "ch_2");
  const c = provider([{ data: { latest_charge: null } }]);
  await assert.rejects(c.p.chargeIdFor("pi_1"), /no tiene cargo/);
});

test("createTransfer: sends the pro's amount in cents with the payment id and the idempotency key", async () => {
  const { p, calls } = provider([{ data: { id: "tr_1" } }]);
  const id = await p.createTransfer({
    paymentId: "pay-1",
    jobId: "job-1",
    chargeId: "ch_1",
    destination: "acct_pro",
    amountMinor: 1320,
    currency: "USD",
    idempotencyKey: "release_pay-1",
  });
  assert.equal(id, "tr_1");
  assert.equal(calls[0].url, "https://api.stripe.com/v1/transfers");
  assert.equal(calls[0].headers["Idempotency-Key"], "release_pay-1");
  assert.equal(
    calls[0].body,
    new URLSearchParams([
      ["amount", "1320"],
      ["currency", "usd"],
      ["destination", "acct_pro"],
      ["source_transaction", "ch_1"],
      ["transfer_group", "job-1"],
      ["metadata[payment_id]", "pay-1"],
    ]).toString(),
  );
});

test("findTransfer: finds the transfer by payment id within the job's group, or returns null", async () => {
  const hit = provider([{ data: { data: [{ id: "tr_a", metadata: { payment_id: "pay-1" } }] } }]);
  assert.equal(await hit.p.findTransfer("job-1", "pay-1"), "tr_a");
  assert.equal(hit.calls[0].url, "https://api.stripe.com/v1/transfers?transfer_group=job-1&limit=100");
  const miss = provider([{ data: { data: [{ id: "tr_b", metadata: { payment_id: "pay-2" } }] } }]);
  assert.equal(await miss.p.findTransfer("job-1", "pay-1"), null);
});

test("findRefund: matches the refund row and ignores failed or canceled refunds", async () => {
  const hit = provider([
    {
      data: {
        data: [
          { id: "re_old", metadata: { refund_id: "rf-1" }, status: "failed" },
          { id: "re_ok", metadata: { refund_id: "rf-1" }, status: "succeeded" },
        ],
      },
    },
  ]);
  assert.equal(await hit.p.findRefund("pi_1", "rf-1"), "re_ok");
  assert.equal(hit.calls[0].url, "https://api.stripe.com/v1/refunds?payment_intent=pi_1&limit=100");
  const onlyFailed = provider([{ data: { data: [{ id: "re_x", metadata: { refund_id: "rf-1" }, status: "canceled" }] } }]);
  assert.equal(await onlyFailed.p.findRefund("pi_1", "rf-1"), null);
});

test("createRefund: sends the amount, the refund id, and the idempotency key", async () => {
  const { p, calls } = provider([{ data: { id: "re_1" } }]);
  const id = await p.createRefund({ refundId: "rf-1", paymentRef: "pi_1", amountMinor: 2000, currency: "USD", idempotencyKey: "refund_rf-1" });
  assert.equal(id, "re_1");
  assert.equal(calls[0].url, "https://api.stripe.com/v1/refunds");
  assert.equal(calls[0].headers["Idempotency-Key"], "refund_rf-1");
  assert.equal(
    calls[0].body,
    new URLSearchParams([
      ["payment_intent", "pi_1"],
      ["amount", "2000"],
      ["metadata[refund_id]", "rf-1"],
    ]).toString(),
  );
});

test("registry: stripe resolves with USD; an unknown provider is refused", () => {
  const config = { stripeSecretKey: "sk_test_x", stripeWebhookSecret: SECRET };
  const s = providerFor("stripe", config);
  assert.equal(s.id, "stripe");
  assert.equal(s.currency, "USD");
  assert.throws(() => providerFor("azul", config), /Proveedor de pago desconocido: azul/);
});

test("createTransfer without a charge: no source_transaction, funded from the platform balance", async () => {
  const { p, calls } = provider([{ data: { id: "tr_2" } }]);
  const id = await p.createTransfer({
    paymentId: "pay-2",
    jobId: "job-2",
    destination: "acct_pro",
    amountMinor: 1100,
    currency: "USD",
    idempotencyKey: "release_pay-2",
  });
  assert.equal(id, "tr_2");
  assert.equal(
    calls[0].body,
    new URLSearchParams([
      ["amount", "1100"],
      ["currency", "usd"],
      ["destination", "acct_pro"],
      ["transfer_group", "job-2"],
      ["metadata[payment_id]", "pay-2"],
    ]).toString(),
  );
});
