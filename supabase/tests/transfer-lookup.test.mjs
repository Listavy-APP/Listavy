// Run: node --experimental-strip-types supabase/tests/transfer-lookup.test.mjs
import assert from "node:assert/strict";
import { findTransferForPayment } from "../functions/_shared/payments/transfer-lookup.ts";

const transfers = [
  { id: "tr_a", metadata: { payment_id: "pay-1" } },
  { id: "tr_b", metadata: { payment_id: "pay-2" } },
  { id: "tr_c", metadata: null },
];

assert.equal(findTransferForPayment(transfers, "pay-1")?.id, "tr_a");
assert.equal(findTransferForPayment(transfers, "pay-2")?.id, "tr_b");
assert.equal(findTransferForPayment(transfers, "pay-3"), null, "unknown payment has no transfer");
assert.equal(findTransferForPayment([], "pay-1"), null, "empty list has no transfer");
assert.equal(findTransferForPayment(transfers, ""), null, "blank id never matches a null metadata");
console.log("transfer-lookup: 5/5 passed");
