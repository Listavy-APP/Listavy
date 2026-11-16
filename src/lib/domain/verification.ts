// B1 pro verification ladder. Pure rules, no I/O.
// Spec: LISTAVY_B1_VERIFICATION_BUILD_PLAN_2026-11-16.md. Badge wording is DRAFT pending counsel.

export const STAGES = [
  "identity",
  "buena_conducta",
  "sie_licence",
  "infotep_certificate",
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
  return ["identity", "buena_conducta", trade_stage, "insurance"];
}

/** Current approved stages from pro_current_verifications. */
export type CurrentStage = { stage: Stage; verified_at: string; expires_at: string | null };

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
