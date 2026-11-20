// Verified icon rule (build item: verified icon). Pure, no I/O.
// The icon shows only for identity verified (cédula + selfie) or, for companies, the company set complete.
// Merely approved pros never get it: approval (pros.verified_at) is not verification.
import { companyVerified, identityVerified, type CurrentStage, type Stage } from "./verification.ts";

export type VerifiedKind = "person" | "company";

/** Icon kind for one pro, from the stage names approved and unexpired (pro_verified_flags, 0102). */
export function verifiedIconKind(stages: readonly string[], isCompany: boolean): VerifiedKind | null {
  const current = stages.map((s) => ({ stage: s as Stage, verified_at: "", expires_at: null })) as CurrentStage[];
  if (isCompany) return companyVerified(current) ? "company" : null;
  return identityVerified(current) ? "person" : null;
}
