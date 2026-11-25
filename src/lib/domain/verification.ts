// B1 pro verification ladder. Pure rules, no I/O.
// Spec: LISTAVY_B1_VERIFICATION_BUILD_PLAN_2026-11-16.md. Badge wording is DRAFT pending counsel.
// Policy 2026-11-24 (LISTAVY_MSG_CLAUDE_VERIFICATION_POLICY_2026-11-24.md):
//   - Supporting documents are optional for everyone. Nothing waits on them.
//   - An individual is approved with cédula + selfie. The verified badge also needs a current buena conducta.
//   - Buena conducta is valid one year (migration 0121). A lapse drops the badge only.
//   - Company rules are unchanged.

export const STAGES = [
  "identity",
  "selfie",
  "buena_conducta",
  "sie_licence",
  "infotep_certificate",
  "diploma",
  "insurance",
  "company_entity",
  "company_registry",
  "representative",
] as const;
export type Stage = (typeof STAGES)[number];

/** Stages a pro may submit, by pro type and trade. Electricians get the SIE licence stage; others the INFOTEP stage. */
export function stagesFor(proType: "individual" | "company", trade: string): Stage[] {
  if (proType === "company") return ["company_entity", "company_registry", "representative", "buena_conducta", "insurance"];
  const trade_stage: Stage = trade === "electrician" ? "sie_licence" : "infotep_certificate";
  return ["identity", "selfie", "buena_conducta", trade_stage, "diploma", "insurance"];
}

/** Optional supporting documents. Approved ones show on the profile. Nothing waits on them. */
export const SUPPORTING_STAGES: readonly Stage[] = ["sie_licence", "infotep_certificate", "diploma", "insurance"];

export function isSupporting(stage: Stage): boolean {
  return SUPPORTING_STAGES.includes(stage);
}

/** Stages that gate approval (the summary and the checklist). Individuals: cédula + selfie. Companies: unchanged. */
export function requiredStagesFor(proType: "individual" | "company"): Stage[] {
  if (proType === "company") return ["company_entity", "company_registry", "representative", "buena_conducta"];
  return ["identity", "selfie"];
}

/** Identity is two uploads: the cédula photo and the selfie. */
export function identityVerified(current: CurrentStage[]): boolean {
  const have = new Set(current.map((c) => c.stage));
  return have.has("identity") && have.has("selfie");
}

/** Current approved stages from pro_current_verifications. */
export type CurrentStage = { stage: Stage; verified_at: string; expires_at: string | null };

/**
 * Individual verified badge: cédula + selfie approved AND a buena conducta approved and unexpired (policy 2026-11-24).
 * `today` is a YYYY-MM-DD date in Santo Domingo time. Expiry counts as current through its own day, matching
 * pro_verified_flags (0102), which uses expires_at >= current_date.
 */
export function individualVerified(current: CurrentStage[], today: string): boolean {
  if (!identityVerified(current)) return false;
  return current.some((c) => c.stage === "buena_conducta" && c.expires_at !== null && c.expires_at >= today);
}

/** Stages whose approval is required before the company badge shows. */
const COMPANY_REQUIRED: Stage[] = ["company_entity", "company_registry", "representative", "buena_conducta"];

export function companyVerified(current: CurrentStage[]): boolean {
  const have = new Set(current.map((c) => c.stage));
  return COMPANY_REQUIRED.every((s) => have.has(s));
}

/** Days a buena conducta may be old when submitted (Listavy rule). */
export const BUENA_CONDUCTA_MAX_AGE_DAYS = 30;

export function buenaConductaWindowOk(issueDate: string, today: string): boolean {
  const issued = Date.parse(`${issueDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(issued) || Number.isNaN(now)) return false;
  const days = (now - issued) / 86_400_000;
  return days >= 0 && days <= BUENA_CONDUCTA_MAX_AGE_DAYS;
}

/** Stages that must carry an expiry date on submission (the admin confirms it from the document). */
export function needsExpiryInput(stage: Stage): boolean {
  return stage === "company_registry" || stage === "insurance" || stage === "sie_licence";
}

/** Stages whose issue date the pro enters. */
export function needsIssueInput(stage: Stage): boolean {
  return stage === "buena_conducta";
}

/** One-line status for the account page. Derived from the latest row per stage. */
export type VerificationSummary =
  | { state: "none" }
  | { state: "pending" }
  | { state: "rejected" }
  | { state: "partial"; approved: number; total: number; lastVerifiedAt: string }
  | { state: "approved"; total: number; lastVerifiedAt: string };

/**
 * Summary over the required stages only. Pass requiredStagesFor(...). Supporting stages are filtered out here too,
 * so an optional document can never hold a pro in pending, rejected or partial.
 */
export function summarizeVerifications(
  requiredStages: Stage[],
  latest: { stage: Stage; status: "pending" | "approved" | "rejected"; verified_at: string | null }[],
): VerificationSummary {
  const stages = requiredStages.filter((s) => !isSupporting(s));
  const byStage = new Map(latest.map((r) => [r.stage, r]));
  const approved = stages.filter((s) => byStage.get(s)?.status === "approved");
  const dates = approved.map((s) => byStage.get(s)?.verified_at).filter((d): d is string => !!d).sort();
  if (approved.length > 0 && dates.length > 0) {
    const lastVerifiedAt = dates[dates.length - 1];
    return approved.length === stages.length
      ? { state: "approved", total: stages.length, lastVerifiedAt }
      : { state: "partial", approved: approved.length, total: stages.length, lastVerifiedAt };
  }
  const statuses = stages.map((s) => byStage.get(s)?.status);
  if (statuses.includes("pending")) return { state: "pending" };
  if (statuses.includes("rejected")) return { state: "rejected" };
  return { state: "none" };
}

/** Consent version the verification upload passes. Same value as VerificationForm (draft, pending counsel). */
export const DOCUMENT_CONSENT_VERSION = "draft-2026-11-16";
