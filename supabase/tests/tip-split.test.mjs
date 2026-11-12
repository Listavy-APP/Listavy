// Tip rules (D2) and the charge split used by stripe-checkout. Pure functions, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitPayment, validateTip } from "../functions/stripe-checkout/commission.ts";

test("tip cap: exactly 20% of the job price is allowed, one peso more is refused", () => {
  assert.equal(validateTip(1200, 6000), 1200);
  assert.throws(() => validateTip(1201, 6000), /20%/);
});

test("tip cap rounds half up to the peso", () => {
  assert.equal(validateTip(200, 1002), 200); // 200.4 -> 200
  assert.equal(validateTip(201, 1003), 201); // 200.6 -> 201
  assert.throws(() => validateTip(201, 1002), /20%/); // 200.4 -> 200, so 201 is over
});

test("tip must be a non-negative whole number", () => {
  assert.throws(() => validateTip(-1, 6000), /entero|non-negative/);
  assert.throws(() => validateTip(10.5, 6000), /non-negative whole/);
  assert.equal(validateTip(0, 6000), 0);
});

test("repair with credit and tip: charge is quote minus credit plus tip", () => {
  const s = splitPayment({ quoteDop: 6000, creditDop: 750, tipDop: 500, kind: "repair", plan: "free" });
  assert.equal(s.chargedDop, 5250);
  assert.equal(s.tipDop, 500);
  assert.equal(s.amountDop, 5750);
});

test("commission is on the job amount only: the tip adds none", () => {
  const noTip = splitPayment({ quoteDop: 6000, creditDop: 750, tipDop: 0, kind: "repair", plan: "free" });
  const tip = splitPayment({ quoteDop: 6000, creditDop: 750, tipDop: 500, kind: "repair", plan: "free" });
  assert.equal(noTip.commissionDop, 630); // 12% of 5,250
  assert.equal(tip.commissionDop, 630);
});

test("tip goes 100% to the pro: payout rises by exactly the tip", () => {
  const noTip = splitPayment({ quoteDop: 6000, creditDop: 750, tipDop: 0, kind: "repair", plan: "free" });
  const tip = splitPayment({ quoteDop: 6000, creditDop: 750, tipDop: 500, kind: "repair", plan: "free" });
  assert.equal(noTip.proPayoutDop, 4620);
  assert.equal(tip.proPayoutDop, 5120);
  assert.equal(tip.proPayoutDop - noTip.proPayoutDop, 500);
});

test("split is consistent: payout plus commission equals the amount charged", () => {
  for (const [kind, plan, quote, credit, tip] of [
    ["repair", "free", 6000, 750, 500],
    ["repair", "pro", 6000, 0, 1200],
    ["diagnostic", "free", 750, 0, 150],
    ["repair", "free", 30000, 0, 6000],
  ]) {
    const s = splitPayment({ quoteDop: quote, creditDop: credit, tipDop: tip, kind, plan });
    assert.equal(s.proPayoutDop + s.commissionDop, s.amountDop, `${kind}/${plan}/${quote}`);
  }
});

test("diagnostic with tip: 15% on the diagnostic, tip carries none", () => {
  const s = splitPayment({ quoteDop: 750, creditDop: 0, tipDop: 150, kind: "diagnostic", plan: "free" });
  assert.equal(s.commissionDop, 113); // 15% of 750 = 112.5, half up
  assert.equal(s.amountDop, 900);
  assert.equal(s.proPayoutDop, 787); // 637 + 150
});

test("tip over the cap is refused before any charge is computed", () => {
  assert.throws(() => splitPayment({ quoteDop: 6000, creditDop: 750, tipDop: 1300, kind: "repair", plan: "free" }), /20%/);
});

test("nothing to charge is refused", () => {
  assert.throws(() => splitPayment({ quoteDop: 750, creditDop: 750, tipDop: 0, kind: "repair", plan: "free" }), /No hay monto/);
});
