// Run: node --experimental-strip-types --test supabase/tests/client-customer.test.mjs
// Race rules for the client Stripe Customer. Storage and Stripe are in-memory fakes. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureClientCustomer } from "../functions/_shared/payments/client-customer.ts";

// In-memory table with the same semantics as the migration: primary key (profile, mode), unique customer id.
function fakeWorld() {
  const rows = new Map(); // key profile|mode -> customer id
  const used = new Set();
  const deleted = [];
  let n = 0;
  const idempotent = new Map(); // idempotency key -> customer id (Stripe returns the same object)
  const deps = (mode = "test") => ({
    mode,
    async findStored(profileId, m) {
      return rows.get(`${profileId}|${m}`) ?? null;
    },
    async createCustomer({ idempotencyKey }) {
      if (idempotent.has(idempotencyKey)) return idempotent.get(idempotencyKey);
      const id = `cus_${++n}`;
      idempotent.set(idempotencyKey, id);
      return id;
    },
    async storeIfAbsent(profileId, m, customerId) {
      const key = `${profileId}|${m}`;
      if (rows.has(key)) return rows.get(key);
      if (used.has(customerId)) throw new Error("unique violation");
      rows.set(key, customerId);
      used.add(customerId);
      return customerId;
    },
    async deleteCustomer(id) {
      deleted.push(id);
    },
  });
  return { rows, deleted, deps, idempotent };
}

test("first call creates one customer and stores it", async () => {
  const w = fakeWorld();
  const id = await ensureClientCustomer(w.deps(), "client-1");
  assert.equal(id, "cus_1");
  assert.equal(w.rows.get("client-1|test"), "cus_1");
  assert.deepEqual(w.deleted, []);
});

test("later calls reuse the stored customer and create nothing", async () => {
  const w = fakeWorld();
  await ensureClientCustomer(w.deps(), "client-1");
  const again = await ensureClientCustomer(w.deps(), "client-1");
  assert.equal(again, "cus_1");
  assert.equal(w.idempotent.size, 1);
});

test("double-click: two concurrent calls resolve to one stored customer", async () => {
  const w = fakeWorld();
  const [a, b] = await Promise.all([ensureClientCustomer(w.deps(), "client-1"), ensureClientCustomer(w.deps(), "client-1")]);
  assert.equal(a, b);
  assert.equal(w.rows.size, 1);
});

test("lost race with a different Stripe customer: the duplicate is deleted and the winner is returned", async () => {
  // Simulates a retry after the idempotency window: the second caller gets a new customer id.
  const w = fakeWorld();
  w.rows.set("client-1|test", "cus_winner");
  const d = w.deps();
  d.findStored = async () => null; // this caller read before the winner stored
  const id = await ensureClientCustomer(d, "client-1");
  assert.equal(id, "cus_winner");
  assert.deepEqual(w.deleted, ["cus_1"]);
});

test("cleanup failure does not fail the caller", async () => {
  const w = fakeWorld();
  w.rows.set("client-1|test", "cus_winner");
  const d = w.deps();
  d.findStored = async () => null;
  d.deleteCustomer = async () => {
    throw new Error("network");
  };
  assert.equal(await ensureClientCustomer(d, "client-1"), "cus_winner");
});

test("modes are separate: a test customer is never reused in live mode", async () => {
  const w = fakeWorld();
  await ensureClientCustomer(w.deps("test"), "client-1");
  const live = await ensureClientCustomer(w.deps("live"), "client-1");
  assert.notEqual(live, "cus_1");
  assert.equal(w.rows.get("client-1|test"), "cus_1");
  assert.equal(w.rows.get("client-1|live"), live);
});

test("a Stripe create failure propagates, so checkout fails closed", async () => {
  const w = fakeWorld();
  const d = w.deps();
  d.createCustomer = async () => {
    throw new Error("stripe down");
  };
  await assert.rejects(ensureClientCustomer(d, "client-1"), /stripe down/);
  assert.equal(w.rows.size, 0);
});
