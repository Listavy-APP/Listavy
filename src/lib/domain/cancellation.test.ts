// Run: node --experimental-strip-types src/lib/domain/cancellation.test.ts
import assert from "node:assert/strict";
import { CANCELLATION_FEE_DOP, cancellationFeeDop, isPastGrace, refundAfterFee, formatDop } from "./cancellation.ts";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const H = 60 * 60 * 1000;

check("fee is RD$300 on a normal job with no tip", () => {
  assert.equal(cancellationFeeDop(6000, 0), CANCELLATION_FEE_DOP);
});

check("fee excludes the tip (amount includes it)", () => {
  assert.equal(cancellationFeeDop(6000, 150), 300, "5850 charged, fee capped at 300");
});

check("fee caps at the charged part when a promo leaves RD$100", () => {
  assert.equal(cancellationFeeDop(100, 40), 60, "charged 60 < 300");
});

check("fee is zero for a tip-only payment", () => {
  assert.equal(cancellationFeeDop(40, 40), 0);
});

check("refund returns the whole tip: amount minus fee", () => {
  assert.equal(refundAfterFee(6000, cancellationFeeDop(6000, 150)), 5700);
  assert.equal(refundAfterFee(100, cancellationFeeDop(100, 40)), 40, "the full tip comes back");
});

check("grace: under 2 hours is free, at 2 hours the fee applies", () => {
  const paid = Date.UTC(2026, 10, 20, 12, 0);
  assert.equal(isPastGrace(paid, paid + 2 * H - 1), false);
  assert.equal(isPastGrace(paid, paid + 2 * H), true);
});

check("formats RD$ amounts", () => {
  assert.equal(formatDop(300), "RD$300");
});

console.log(`${passed} passed`);
