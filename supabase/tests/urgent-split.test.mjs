// 0117 payment math with the urgent fee. The fee is not commissioned and is paid in full to the pro.
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitPayment } from "../functions/stripe-checkout/commission.ts";

const base = { quoteDop: 6000, creditDop: 0, tipDop: 0, kind: "repair", plan: "free" };

test("urgent: amount = charged + fee + tip; the commission reads the charged part only", () => {
  const s = splitPayment({ ...base, tipDop: 300, urgentFeeDop: 500 });
  assert.equal(s.chargedDop, 6000);
  assert.equal(s.commissionDop, 720); // 12% of 6,000
  assert.equal(s.amountDop, 6800);
  assert.equal(s.urgentFeeDop, 500);
  assert.equal(s.proPayoutDop, 5280 + 300); // tip stays on the pro side
});

test("urgent: identity holds with the fee present, with discounts and a tip", () => {
  const s = splitPayment({ ...base, tipDop: 300, urgentFeeDop: 500, discountDop: 400, promoDiscountDop: 0 });
  assert.equal(s.proPayoutDop + s.commissionDop + s.urgentFeeDop, s.amountDop + s.referralDiscountDop + s.promoDiscountDop);
});

test("urgent: without the fee the split is unchanged", () => {
  const s = splitPayment({ ...base, tipDop: 300 });
  assert.equal(s.urgentFeeDop, 0);
  assert.equal(s.amountDop, 6300);
  assert.equal(s.proPayoutDop + s.commissionDop, s.amountDop);
});
