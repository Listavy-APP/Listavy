// Dominican bank details for a future payout. Pure rules, no I/O.
// Collection only: no IBAN, no SWIFT, no Stripe.

export type PayoutDetailsInput = { bankCode: string; branchCode: string; accountNumber: string };

export type PayoutDetailsErrors = Partial<Record<keyof PayoutDetailsInput, string>>;

export const MSG = {
  bankRequired: "Indica el código del banco.",
  bankFormat: "El código del banco debe tener de 1 a 3 dígitos.",
  branchFormat: "El código de sucursal debe tener de 1 a 5 dígitos, o déjalo vacío.",
  accountRequired: "Indica el número de cuenta.",
  accountFormat: "El número de cuenta debe tener hasta 28 dígitos.",
} as const;

/** Keeps digits only. Used while typing, so letters and spaces never enter the field. */
export function digitsOnly(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

export function validatePayoutDetails(input: PayoutDetailsInput): { ok: true; value: { bank_code: string; branch_code: string | null; account_number: string } } | { ok: false; errors: PayoutDetailsErrors } {
  const errors: PayoutDetailsErrors = {};
  const bank = input.bankCode.trim();
  const branch = input.branchCode.trim();
  const account = input.accountNumber.trim();

  if (!bank) errors.bankCode = MSG.bankRequired;
  else if (!/^[0-9]{1,3}$/.test(bank)) errors.bankCode = MSG.bankFormat;

  if (branch && !/^[0-9]{1,5}$/.test(branch)) errors.branchCode = MSG.branchFormat;

  if (!account) errors.accountNumber = MSG.accountRequired;
  else if (!/^[0-9]{1,28}$/.test(account)) errors.accountNumber = MSG.accountFormat;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { bank_code: bank, branch_code: branch || null, account_number: account } };
}

/** Shows the last four digits of the account only. */
export function maskAccount(accountNumber: string): string {
  return `•••• ${accountNumber.slice(-4)}`;
}
