/**
 * Platform commission and pro payout math. All amounts are whole pesos (DOP).
 * Pure functions, no I/O. Stripe fees are NOT handled here: per the brief they
 * come out of the platform commission, never out of the client price or the pro's share.
 *
 * Rules (brief, Sprint 3):
 *  - Repair, pro on the free plan:
 *      amount < 5,000            15%, minimum RD$400
 *      5,000 <= amount <= 25,000 12%
 *      amount > 25,000           10%, commission capped at RD$15,000
 *  - Pro on the paid plan (RD$2,950/mo): 8% flat.            [ASSUMPTION A1]
 *  - Diagnostic visit: 15%, minimum waived.                  [ASSUMPTION A2: no cap]
 *  - Tips: 0% commission, 100% to pro.
 *  - Rounding: half up to the peso. Integer arithmetic only.
 *
 * ASSUMPTIONS to confirm against the plan text before launch:
 *  A1 Pro-plan 8% replaces the tier rate and waives the RD$400 minimum.
 *  A2 Diagnostic commission has no cap (the RD$15,000 cap is stated for repairs).
 *  A3 A 5,000 job uses the 12% tier, and a 25,000 job uses the 12% tier (inclusive bounds).
 *  A4 The RD$15,000 cap applies to every repair commission, including the pro plan's 8%.
 */

export const COMMISSION_MIN_DOP = 400;
export const COMMISSION_CAP_DOP = 15_000;
export const PRO_PLAN_RATE_PCT = 8;
export const DIAGNOSTIC_RATE_PCT = 15;

export type PlanTier = "free" | "pro";
export type JobKind = "repair" | "diagnostic";

export type CommissionResult = {
  /** Commission in whole pesos, after rounding, minimum and cap. */
  commissionDop: number;
  /** Amount the pro receives for the job (before tips), in whole pesos. */
  proPayoutDop: number;
  /** The percentage applied before minimum and cap. */
  ratePct: number;
};

/** Integer half-up rounding of (numerator / denominator) for non-negative values. */
function roundDiv(numerator: number, denominator: number): number {
  return Math.floor((numerator * 2 + denominator) / (denominator * 2));
}

/** Rate, in percent, from the tier table. Does not apply minimum or cap. */
export function tierRatePct(amountDop: number, kind: JobKind, plan: PlanTier): number {
  if (kind === "diagnostic") return DIAGNOSTIC_RATE_PCT;
  if (plan === "pro") return PRO_PLAN_RATE_PCT;
  if (amountDop < 5_000) return 15;
  if (amountDop <= 25_000) return 12;
  return 10;
}

/**
 * Commission for one job. `amountDop` is the agreed job amount in whole pesos.
 * Throws on invalid input rather than guessing.
 */
export function computeCommission(input: {
  amountDop: number;
  kind: JobKind;
  plan: PlanTier;
}): CommissionResult {
  const { amountDop, kind, plan } = input;
  if (!Number.isInteger(amountDop) || amountDop <= 0) {
    throw new Error("amountDop must be a positive whole number of pesos.");
  }

  const ratePct = tierRatePct(amountDop, kind, plan);
  let commission = roundDiv(amountDop * ratePct, 100);

  const waivesMinimum = kind === "diagnostic" || plan === "pro"; // A1, diagnostic per D13
  if (!waivesMinimum && commission < COMMISSION_MIN_DOP) {
    commission = COMMISSION_MIN_DOP;
  }
  // Cap applies to repair commissions only (A2).
  if (kind === "repair" && commission > COMMISSION_CAP_DOP) {
    commission = COMMISSION_CAP_DOP;
  }

  return {
    commissionDop: commission,
    proPayoutDop: amountDop - commission,
    ratePct,
  };
}

/**
 * Diagnostic credit: the diagnostic fee is credited against the repair quote.
 * The credit reduces the amount the homeowner pays for the repair, not the commission.
 * Returns the balance still owed for the repair, never below zero.
 */
export function repairBalanceAfterDiagnosticCredit(repairAmountDop: number, diagnosticFeeDop: number): number {
  if (!Number.isInteger(repairAmountDop) || repairAmountDop < 0) {
    throw new Error("repairAmountDop must be a non-negative whole number.");
  }
  if (!Number.isInteger(diagnosticFeeDop) || diagnosticFeeDop < 0) {
    throw new Error("diagnosticFeeDop must be a non-negative whole number.");
  }
  return Math.max(0, repairAmountDop - diagnosticFeeDop);
}

/** Revision difference: positive means the homeowner owes more ("a pagar"), negative means refund ("a devolver"). */
export function revisionDifferenceDop(paidAmountDop: number, revisedAmountDop: number): number {
  if (!Number.isInteger(paidAmountDop) || !Number.isInteger(revisedAmountDop)) {
    throw new Error("Amounts must be whole pesos.");
  }
  return revisedAmountDop - paidAmountDop;
}

/** Tips go 100% to the pro, with no commission. Cap is 20% of the job amount (D2). */
export function validateTip(tipDop: number, jobAmountDop: number): number {
  if (!Number.isInteger(tipDop) || tipDop < 0) {
    throw new Error("tipDop must be a non-negative whole number.");
  }
  const cap = roundDiv(jobAmountDop * 20, 100);
  if (tipDop > cap) {
    throw new Error(`La propina no puede superar RD$${cap} (20% del trabajo).`);
  }
  return tipDop;
}
