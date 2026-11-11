// Run: node --experimental-strip-types src/lib/domain/commission.test.ts
import assert from "node:assert/strict";
import {
  COMMISSION_CAP_DOP,
  computeCommission,
  repairBalanceAfterDiagnosticCredit,
  revisionDifferenceDop,
  validateTip,
} from "./commission.ts";

const repair = (amountDop: number, plan: "free" | "pro" = "free") =>
  computeCommission({ amountDop, kind: "repair", plan });

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// Free plan, tier boundaries and minimum.
check("under 5,000 uses 15%", () => {
  assert.deepEqual(repair(4_000), { commissionDop: 600, proPayoutDop: 3_400, ratePct: 15 });
});
check("15% minimum RD$400 applies below 2,667", () => {
  // 15% of 2,000 = 300, so the minimum applies.
  assert.equal(repair(2_000).commissionDop, 400);
  assert.equal(repair(2_000).proPayoutDop, 1_600);
});
check("minimum is not applied once 15% exceeds RD$400", () => {
  // 15% of 2,667 = 400.05 -> 400; 15% of 2,700 = 405.
  assert.equal(repair(2_700).commissionDop, 405);
});
check("4,999 stays on 15% tier", () => {
  assert.equal(repair(4_999).commissionDop, 750); // 14.9985 -> 750 (half-up)
  assert.equal(repair(4_999).ratePct, 15);
});
check("5,000 enters 12% tier (A3, inclusive)", () => {
  assert.deepEqual(repair(5_000), { commissionDop: 600, proPayoutDop: 4_400, ratePct: 12 });
});
check("12% tier at 25,000 (A3, inclusive)", () => {
  assert.equal(repair(25_000).commissionDop, 3_000);
  assert.equal(repair(25_000).ratePct, 12);
});
check("above 25,000 uses 10%", () => {
  assert.equal(repair(25_001).ratePct, 10);
  assert.equal(repair(30_000).commissionDop, 3_000);
});
check("10% commission capped at RD$15,000", () => {
  assert.equal(repair(150_000).commissionDop, 15_000);
  assert.equal(repair(150_000).proPayoutDop, 135_000);
});
check("cap boundary: 10% of 150,000 equals cap exactly", () => {
  assert.equal(repair(150_000).commissionDop, COMMISSION_CAP_DOP);
});
check("rounding half-up to the peso", () => {
  // 12% of 5,417 = 650.04 -> 650; 12% of 5,425 = 651.00 -> 651; 15% of 4,333 = 649.95 -> 650
  assert.equal(repair(5_417).commissionDop, 650);
  assert.equal(repair(5_425).commissionDop, 651);
  assert.equal(repair(4_333).commissionDop, 650);
});

// Pro plan.
check("pro plan 8% flat (A1), minimum waived", () => {
  assert.deepEqual(repair(2_000, "pro"), { commissionDop: 160, proPayoutDop: 1_840, ratePct: 8 });
});
check("pro plan 8% on a large job is capped at RD$15,000 (A4)", () => {
  // 8% of 200,000 = 16,000, capped to 15,000.
  assert.equal(repair(200_000, "pro").commissionDop, 15_000);
  assert.equal(repair(100_000, "pro").commissionDop, 8_000);
});

// Diagnostic (D13): 15%, minimum waived, no cap (A2).
check("diagnostic 15% with minimum waived", () => {
  const r = computeCommission({ amountDop: 500, kind: "diagnostic", plan: "free" });
  assert.deepEqual(r, { commissionDop: 75, proPayoutDop: 425, ratePct: 15 });
});
check("diagnostic 1,000 at 15%", () => {
  assert.equal(computeCommission({ amountDop: 1_000, kind: "diagnostic", plan: "free" }).commissionDop, 150);
});
check("diagnostic has no cap (A2)", () => {
  assert.equal(computeCommission({ amountDop: 100_000, kind: "diagnostic", plan: "free" }).commissionDop, 15_000);
  assert.equal(computeCommission({ amountDop: 200_000, kind: "diagnostic", plan: "free" }).commissionDop, 30_000);
});

// Diagnostic credit against repair.
check("diagnostic credit reduces repair balance", () => {
  assert.equal(repairBalanceAfterDiagnosticCredit(8_000, 750), 7_250);
  assert.equal(repairBalanceAfterDiagnosticCredit(500, 1_000), 0);
});

// Revision difference.
check("revision difference: positive means a pagar", () => {
  assert.equal(revisionDifferenceDop(6_000, 7_500), 1_500);
});
check("revision difference: negative means a devolver", () => {
  assert.equal(revisionDifferenceDop(7_500, 6_000), -1_500);
});

// Tips.
check("tip up to 20% accepted", () => {
  assert.equal(validateTip(1_000, 5_000), 1_000);
});
check("tip above 20% rejected", () => {
  assert.throws(() => validateTip(1_001, 5_000), /20%/);
});

// Invalid input.
check("rejects non-integer amount", () => {
  assert.throws(() => repair(1_000.5), /whole number/);
});
check("rejects zero amount", () => {
  assert.throws(() => repair(0), /positive/);
});

console.log(`\n${passed} commission checks passed.`);
