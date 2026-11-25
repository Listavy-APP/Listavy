// Run: node --experimental-strip-types src/lib/domain/verification-policy.test.ts
// Policy 2026-11-24: optional supporting docs, yearly buena conducta, badge-only gate (Reading A).
import assert from "node:assert/strict";
import {
  stagesFor,
  companyVerified,
  individualVerified,
  isSupporting,
  requiredStagesFor,
  summarizeVerifications,
  SUPPORTING_STAGES,
  type CurrentStage,
} from "./verification.ts";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const cur = (stage: CurrentStage["stage"], expires_at: string | null = null): CurrentStage => ({
  stage,
  verified_at: "2026-11-01T00:00:00Z",
  expires_at,
});
const row = (stage: Parameters<typeof summarizeVerifications>[1][number]["stage"], status: "pending" | "approved" | "rejected") => ({
  stage,
  status,
  verified_at: status === "approved" ? "2026-11-01T00:00:00Z" : null,
});
const TODAY = "2026-11-24";

check("supporting stages are exactly SIE, INFOTEP, diploma and insurance", () => {
  assert.deepEqual([...SUPPORTING_STAGES].sort(), ["diploma", "infotep_certificate", "insurance", "sie_licence"]);
  assert.equal(isSupporting("insurance"), true);
  assert.equal(isSupporting("buena_conducta"), false);
});

check("individual stages include diploma before insurance; companies do not get it", () => {
  assert.deepEqual(stagesFor("individual", "plumber"), ["identity", "selfie", "buena_conducta", "infotep_certificate", "diploma", "insurance"]);
  assert.deepEqual(stagesFor("individual", "electrician"), ["identity", "selfie", "buena_conducta", "sie_licence", "diploma", "insurance"]);
  assert.equal(stagesFor("company", "plumber").includes("diploma"), false);
});

check("individual: identity + selfie approved, no buena conducta: badge off, summary approved", () => {
  const current = [cur("identity"), cur("selfie")];
  assert.equal(individualVerified(current, TODAY), false);
  const s = summarizeVerifications(requiredStagesFor("individual"), [row("identity", "approved"), row("selfie", "approved")]);
  assert.deepEqual(s, { state: "approved", total: 2, lastVerifiedAt: "2026-11-01T00:00:00Z" });
});

check("individual: identity + selfie + current buena conducta: badge on", () => {
  assert.equal(individualVerified([cur("identity"), cur("selfie"), cur("buena_conducta", "2027-11-01")], TODAY), true);
});

check("individual: buena conducta expiring today still counts; yesterday does not", () => {
  assert.equal(individualVerified([cur("identity"), cur("selfie"), cur("buena_conducta", TODAY)], TODAY), true);
  assert.equal(individualVerified([cur("identity"), cur("selfie"), cur("buena_conducta", "2026-11-23")], TODAY), false);
});

check("individual: expired buena conducta: badge off, pro still approved", () => {
  const current = [cur("identity"), cur("selfie"), cur("buena_conducta", "2025-11-30")];
  assert.equal(individualVerified(current, TODAY), false);
  const s = summarizeVerifications(requiredStagesFor("individual"), [row("identity", "approved"), row("selfie", "approved")]);
  assert.equal(s.state, "approved");
});

check("individual: buena conducta without identity + selfie: badge off", () => {
  assert.equal(individualVerified([cur("buena_conducta", "2027-11-01")], TODAY), false);
});

check("company: badge rule unchanged (entity, registry, representative, buena conducta)", () => {
  const full = [cur("company_entity"), cur("company_registry"), cur("representative"), cur("buena_conducta")];
  assert.equal(companyVerified(full), true);
  assert.equal(companyVerified(full.slice(0, 3)), false);
  assert.equal(companyVerified(full.filter((c) => c.stage !== "buena_conducta")), false);
});

check("company: summary reaches approved without the optional insurance", () => {
  const s = summarizeVerifications(requiredStagesFor("company"), [
    row("company_entity", "approved"),
    row("company_registry", "approved"),
    row("representative", "approved"),
    row("buena_conducta", "approved"),
  ]);
  assert.equal(s.state, "approved");
});

check("optional stages absent: individual summary can still reach approved", () => {
  const s = summarizeVerifications(requiredStagesFor("individual"), [row("identity", "approved"), row("selfie", "approved")]);
  assert.equal(s.state, "approved");
});

check("optional stage pending or rejected never holds the summary back", () => {
  const pending = summarizeVerifications(requiredStagesFor("individual"), [
    row("identity", "approved"),
    row("selfie", "approved"),
    row("insurance", "pending"),
  ]);
  assert.equal(pending.state, "approved");
  const rejected = summarizeVerifications(requiredStagesFor("individual"), [
    row("identity", "approved"),
    row("selfie", "approved"),
    row("infotep_certificate", "rejected"),
  ]);
  assert.equal(rejected.state, "approved");
});

check("supporting stages are never required, for either pro type", () => {
  for (const type of ["individual", "company"] as const) {
    for (const s of requiredStagesFor(type)) assert.equal(isSupporting(s), false, `${type} requires ${s}`);
  }
});

console.log(`${passed} passed`);
