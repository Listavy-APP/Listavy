// Verified icon rule (build item: verified icon). Pure, no I/O.
// The icon shows for an individual with cédula + selfie + a current buena conducta (policy 2026-11-24),
// or for companies, the company set complete. Merely approved pros never get it: approval is not verification.
import { companyVerified, individualVerified, type CurrentStage, type Stage } from "./verification.ts";

export type VerifiedKind = "person" | "company";

/** Icon kind for one pro, from the stage names approved and unexpired (pro_verified_flags, 0102). */
export function verifiedIconKind(stages: readonly string[], isCompany: boolean): VerifiedKind | null {
  // pro_verified_flags already returns only unexpired stages, so the placeholder date is always current.
  const current = stages.map((s) => ({ stage: s as Stage, verified_at: "", expires_at: "9999-12-31" })) as CurrentStage[];
  if (isCompany) return companyVerified(current) ? "company" : null;
  return individualVerified(current, "0000-01-01") ? "person" : null;
}
