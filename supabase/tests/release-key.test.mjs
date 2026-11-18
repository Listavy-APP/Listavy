// Run: node --experimental-strip-types --test supabase/tests/release-key.test.mjs
// Release idempotency (queue item 2). Key rules are pure. The Stripe classification runs through the
// real adapter against a fake fetch. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { releaseKey, isConfirmedRejection, stripeErrorKind } from "../functions/_shared/payments/release-key.ts";
import { createStripeProvider } from "../functions/_shared/payments/stripe.ts";

const PAY = "3f1c2b7e-0000-4000-8000-00000000abcd";

test("version 1 keeps the original key, so transfers already in flight are unaffected", () => {
  assert.equal(releaseKey(PAY, 1), `release_${PAY}`);
});

test("each bumped version gets a new key", () => {
  assert.equal(releaseKey(PAY, 2), `release_${PAY}_v2`);
  assert.equal(releaseKey(PAY, 3), `release_${PAY}_v3`);
  const keys = [1, 2, 3, 4].map((v) => releaseKey(PAY, v));
  assert.equal(new Set(keys).size, 4);
});

test("invalid versions are refused", () => {
  for (const v of [0, -1, 1.5, NaN]) assert.throws(() => releaseKey(PAY, v));
});

test("definitive Stripe refusals are rejected; 409, 429 and 5xx are unknown", () => {
  for (const s of [400, 401, 402, 403, 404]) assert.equal(stripeErrorKind(s), "rejected", `status ${s}`);
  for (const s of [409, 429, 500, 502, 503, 504]) assert.equal(stripeErrorKind(s), "unknown", `status ${s}`);
});

test("only a confirmed rejection triggers a key bump", () => {
  assert.equal(isConfirmedRejection({ kind: "rejected" }), true);
  assert.equal(isConfirmedRejection({ kind: "unknown" }), false);
  assert.equal(isConfirmedRejection(new Error("network down")), false);
  assert.equal(isConfirmedRejection(null), false);
});

// Through the real adapter: the error kind and the Idempotency-Key header Stripe receives.
function transferWith(response) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers ?? {} });
    if (response instanceof Error) throw response;
    return {
      ok: response.status < 400,
      status: response.status,
      json: async () => {
        if (response.raw !== undefined) throw new SyntaxError("Unexpected token <");
        return response.data;
      },
    };
  };
  const p = createStripeProvider({ secretKey: "sk_test_x", webhookSecret: "whsec_x", fetch });
  const input = {
    paymentId: PAY,
    jobId: "job-1",
    destination: "acct_pro",
    amountMinor: 5000,
    currency: "USD",
    idempotencyKey: releaseKey(PAY, 2),
  };
  return { run: () => p.createTransfer(input), calls };
}

test("a 400 from Stripe is a confirmed rejection, and the key is sent as Idempotency-Key", async () => {
  const t = transferWith({ status: 400, data: { error: { message: "Insufficient funds in your Stripe account." } } });
  await assert.rejects(t.run(), (err) => {
    assert.equal(err.kind, "rejected");
    assert.equal(err.status, 400);
    assert.match(err.message, /Insufficient funds/);
    return true;
  });
  assert.equal(t.calls[0].headers["Idempotency-Key"], releaseKey(PAY, 2));
});

test("a 500 is unknown: the caller keeps the same key", async () => {
  const t = transferWith({ status: 500, data: { error: { message: "Server error" } } });
  await assert.rejects(t.run(), (err) => {
    assert.equal(err.kind, "unknown");
    return true;
  });
});

test("a 409 (concurrent request) is unknown, not a refusal", async () => {
  const t = transferWith({ status: 409, data: { error: { message: "Keys for idempotent requests can only be used once" } } });
  await assert.rejects(t.run(), (err) => {
    assert.equal(err.kind, "unknown");
    return true;
  });
});

test("a network failure is unknown", async () => {
  const t = transferWith(new Error("socket hang up"));
  await assert.rejects(t.run(), (err) => {
    assert.notEqual(err.kind, "rejected");
    return true;
  });
});

test("a non-JSON error body (gateway page) is unknown", async () => {
  const t = transferWith({ status: 502, raw: true });
  await assert.rejects(t.run(), (err) => {
    assert.equal(err.kind, undefined);
    return true;
  });
});

test("a successful transfer returns its id", async () => {
  const t = transferWith({ status: 200, data: { id: "tr_123" } });
  assert.equal(await t.run(), "tr_123");
});
