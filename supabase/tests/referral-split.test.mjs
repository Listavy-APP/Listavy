// Referral discount on the charge split (Invita y gana). The pro is paid on the full amount;
// Listavy funds the discount. Pure functions, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitPayment } from "../functions/stripe-checkout/commission.ts";

const invariant = (s) => assert.equal(s.proPayoutDop + s.commissionDop, s.amountDop + s.referralDiscountDop);

test("no discount: split is unchanged from before the referral feature", () => {
  const s = splitPayment({ quoteDop: 6000, creditDop: 750, tipDop: 500, kind: "repair", plan: "free" });
  assert.equal(s.chargedDop, 5250);
  assert.equal(s.commissionDop, 630);
  assert.equal(s.proPayoutDop, 5120);
  assert.equal(s.amountDop, 5750);
  assert.equal(s.referralDiscountDop, 0);
  invariant(s);
});

test("first job at the RD$1,500 minimum: client pays 1,000, pro is paid on 1,500 less the 400 minimum", () => {
  const s = splitPayment({ quoteDop: 1500, creditDop: 0, tipDop: 0, kind: "repair", plan: "free", discountDop: 500 });
  assert.equal(s.chargedDop, 1000);
  assert.equal(s.amountDop, 1000);
  assert.equal(s.commissionDop, 400);
  assert.equal(s.proPayoutDop, 1100);
  assert.equal(s.referralDiscountDop, 500);
  invariant(s);
});

test("discount on a 12% tier job: commission and payout use the full quote", () => {
  const s = splitPayment({ quoteDop: 6000, creditDop: 0, tipDop: 0, kind: "repair", plan: "free", discountDop: 500 });
  assert.equal(s.chargedDop, 5500);
  assert.equal(s.commissionDop, 720);
  assert.equal(s.proPayoutDop, 5280);
  invariant(s);
});

test("discount with a tip: the tip goes 100% to the pro and is charged", () => {
  const s = splitPayment({ quoteDop: 6000, creditDop: 0, tipDop: 300, kind: "repair", plan: "free", discountDop: 500 });
  assert.equal(s.amountDop, 5800);
  assert.equal(s.proPayoutDop, 5580);
  assert.equal(s.commissionDop, 720);
  invariant(s);
});

test("pro plan: 8% on the full quote, still paid in full", () => {
  const s = splitPayment({ quoteDop: 6000, creditDop: 0, tipDop: 0, kind: "repair", plan: "pro", discountDop: 500 });
  assert.equal(s.commissionDop, 480);
  assert.equal(s.proPayoutDop, 5520);
  assert.equal(s.chargedDop, 5500);
  invariant(s);
});

test("discount after a diagnostic credit: applies to the balance left after the credit", () => {
  const s = splitPayment({ quoteDop: 6000, creditDop: 750, tipDop: 0, kind: "repair", plan: "free", discountDop: 500 });
  assert.equal(s.chargedDop, 4750);
  assert.equal(s.commissionDop, 630);
  assert.equal(s.proPayoutDop, 4620);
  invariant(s);
});

test("a discount that would leave nothing to charge is refused", () => {
  assert.throws(() => splitPayment({ quoteDop: 500, creditDop: 0, tipDop: 0, kind: "repair", plan: "free", discountDop: 500 }), /supera/);
  assert.throws(() => splitPayment({ quoteDop: 1500, creditDop: 0, tipDop: 0, kind: "repair", plan: "free", discountDop: -1 }), /no es válido/);
});
