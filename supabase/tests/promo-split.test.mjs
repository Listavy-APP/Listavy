// Promo code discount on the charge split (0095). Platform-funded: commission and the pro's payout use
// the amount before the discount. Pure functions, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitPayment } from "../functions/stripe-checkout/commission.ts";

const invariant = (s) =>
  assert.equal(s.proPayoutDop + s.commissionDop, s.amountDop + s.referralDiscountDop + s.promoDiscountDop);

test("percent promo: charge = base - discount + tip; commission stays on the full base", () => {
  const s = splitPayment({ quoteDop: 6000, creditDop: 0, tipDop: 300, kind: "repair", plan: "free", promoDiscountDop: 600 });
  assert.equal(s.chargedDop, 5400);
  assert.equal(s.amountDop, 5700, "charge plus tip");
  assert.equal(s.commissionDop, 720, "12% of 6,000, not of 5,400");
  assert.equal(s.proPayoutDop, 5580, "pro paid on full base plus tip");
  assert.equal(s.promoDiscountDop, 600);
  invariant(s);
});

test("promo with diagnostic credit: base is quote minus credit", () => {
  const s = splitPayment({ quoteDop: 6000, creditDop: 750, tipDop: 0, kind: "repair", plan: "free", promoDiscountDop: 500 });
  assert.equal(s.chargedDop, 4750, "5,250 base minus 500");
  assert.equal(s.commissionDop, 630, "12% of 5,250");
  invariant(s);
});

test("promo on a diagnostic visit: 15% on the visit, no minimum waiver change", () => {
  const s = splitPayment({ quoteDop: 1500, creditDop: 0, tipDop: 0, kind: "diagnostic", plan: "free", promoDiscountDop: 150 });
  assert.equal(s.chargedDop, 1350);
  assert.equal(s.commissionDop, 225, "15% of 1,500");
  invariant(s);
});

test("pro plan: 8% on the full base, not on the discounted charge", () => {
  const s = splitPayment({ quoteDop: 6000, creditDop: 0, tipDop: 0, kind: "repair", plan: "pro", promoDiscountDop: 600 });
  assert.equal(s.commissionDop, 480);
  invariant(s);
});

test("client always pays at least RD$100 of the job: a discount that leaves less is refused", () => {
  assert.throws(() => splitPayment({ quoteDop: 600, creditDop: 0, tipDop: 0, kind: "repair", plan: "free", promoDiscountDop: 550 }), /RD\$100/);
  const ok = splitPayment({ quoteDop: 600, creditDop: 0, tipDop: 0, kind: "repair", plan: "free", promoDiscountDop: 500 });
  assert.equal(ok.chargedDop, 100);
});

test("a discount that covers the whole job is refused; negative or fractional discounts are refused", () => {
  assert.throws(() => splitPayment({ quoteDop: 500, creditDop: 0, tipDop: 0, kind: "repair", plan: "free", promoDiscountDop: 500 }), /supera/);
  assert.throws(() => splitPayment({ quoteDop: 1500, creditDop: 0, tipDop: 0, kind: "repair", plan: "free", promoDiscountDop: -1 }), /no es válido/);
  assert.throws(() => splitPayment({ quoteDop: 1500, creditDop: 0, tipDop: 0, kind: "repair", plan: "free", promoDiscountDop: 10.5 }), /no es válido/);
});

test("no promo: split is unchanged", () => {
  const s = splitPayment({ quoteDop: 6000, creditDop: 0, tipDop: 0, kind: "repair", plan: "free" });
  assert.equal(s.promoDiscountDop, 0);
  assert.equal(s.chargedDop, 6000);
  invariant(s);
});
