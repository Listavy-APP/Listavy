// Run: node --experimental-strip-types src/lib/domain/verification-summary.test.ts
import assert from "node:assert/strict";
import { identityVerified, stagesFor, summarizeVerifications } from "./verification.ts";

const stages = stagesFor("individual", "plumber"); // identity, selfie, buena_conducta, infotep_certificate, insurance

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

check("some approved: partial with latest approval date", () => {
  const s = summarizeVerifications(stages, [
    row("identity", "approved", "2026-11-01T10:00:00Z"),
    row("insurance", "approved", "2026-11-10T10:00:00Z"),
    row("buena_conducta", "pending"),
  ]);
  assert.deepEqual(s, { state: "partial", approved: 2, total: stages.length, lastVerifiedAt: "2026-11-10T10:00:00Z" });
});

check("all stages approved: approved", () => {
  const s = summarizeVerifications(
    stages,
    stages.map((st, i) => row(st, "approved", `2026-11-0${i + 1}T00:00:00Z`)),
  );
  assert.deepEqual(s, { state: "approved", total: stages.length, lastVerifiedAt: `2026-11-0${stages.length}T00:00:00Z` });
});

check("approved row ignored when it is not in this pro's stages", () => {
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

check("individuals get identity and selfie stages", () => {
  assert.deepEqual(stagesFor("individual", "plumber").slice(0, 2), ["identity", "selfie"]);
});

console.log(`${passed} passed`);
