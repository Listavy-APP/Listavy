// Run: node --experimental-strip-types src/lib/domain/verification-summary.test.ts
import assert from "node:assert/strict";
import { identityVerified, requiredStagesFor, summarizeVerifications } from "./verification.ts";

// Individuals are approved on cédula + selfie (policy 2026-11-24). Supporting documents never count.
const stages = requiredStagesFor("individual"); // identity, selfie

const row = (stage: (typeof stages)[number], status: "pending" | "approved" | "rejected", verified_at: string | null = null) => ({
  stage,
  status,
  verified_at,
});

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check("no rows: none", () => {
  assert.deepEqual(summarizeVerifications(stages, []), { state: "none" });
});

check("pending row, nothing approved: pending", () => {
  assert.deepEqual(summarizeVerifications(stages, [row("identity", "pending")]), { state: "pending" });
});

check("rejected row, nothing approved: rejected", () => {
  assert.deepEqual(summarizeVerifications(stages, [row("identity", "rejected")]), { state: "rejected" });
});

check("one of two required approved: partial with latest approval date", () => {
  const s = summarizeVerifications(stages, [
    row("identity", "approved", "2026-11-01T10:00:00Z"),
    row("selfie", "pending"),
  ]);
  assert.deepEqual(s, { state: "partial", approved: 1, total: 2, lastVerifiedAt: "2026-11-01T10:00:00Z" });
});

check("both required approved: approved", () => {
  const s = summarizeVerifications(stages, [
    row("identity", "approved", "2026-11-01T00:00:00Z"),
    row("selfie", "approved", "2026-11-02T00:00:00Z"),
  ]);
  assert.deepEqual(s, { state: "approved", total: 2, lastVerifiedAt: "2026-11-02T00:00:00Z" });
});

check("approved row ignored when it is not in this pro's required stages", () => {
  assert.deepEqual(summarizeVerifications(stages, [row("company_entity", "approved", "2026-11-01T00:00:00Z")]), { state: "none" });
});

check("identity badge needs both the cédula and the selfie", () => {
  assert.equal(identityVerified([{ stage: "identity", verified_at: "x", expires_at: null }]), false);
  assert.equal(identityVerified([{ stage: "selfie", verified_at: "x", expires_at: null }]), false);
  assert.equal(
    identityVerified([
      { stage: "identity", verified_at: "x", expires_at: null },
      { stage: "selfie", verified_at: "x", expires_at: null },
    ]),
    true,
  );
});

check("individuals get identity and selfie as required stages", () => {
  assert.deepEqual(requiredStagesFor("individual"), ["identity", "selfie"]);
});

console.log(`${passed} passed`);
