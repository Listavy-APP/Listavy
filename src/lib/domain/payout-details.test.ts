// Run: node --experimental-strip-types src/lib/domain/payout-details.test.ts
import assert from "node:assert/strict";
import { digitsOnly, maskAccount, MSG, validatePayoutDetails } from "./payout-details.ts";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check("digitsOnly strips letters and spaces and caps length", () => {
  assert.equal(digitsOnly("12a 3-4", 3), "123");
  assert.equal(digitsOnly("123456789", 5), "12345");
});

check("valid details: branch optional becomes null", () => {
  const r = validatePayoutDetails({ bankCode: "015", branchCode: "", accountNumber: "1234567890" });
  assert.deepEqual(r, { ok: true, value: { bank_code: "015", branch_code: null, account_number: "1234567890" } });
});

check("valid details with branch keep leading zeros", () => {
  const r = validatePayoutDetails({ bankCode: "1", branchCode: "00012", accountNumber: "0000000000000000000000000001" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.branch_code, "00012");
    assert.equal(r.value.account_number.length, 28);
  }
});

check("bank code required and 1 to 3 digits", () => {
  const empty = validatePayoutDetails({ bankCode: "", branchCode: "", accountNumber: "1" });
  assert.equal(!empty.ok && empty.errors.bankCode, MSG.bankRequired);
  const long = validatePayoutDetails({ bankCode: "1234", branchCode: "", accountNumber: "1" });
  assert.equal(!long.ok && long.errors.bankCode, MSG.bankFormat);
  const letters = validatePayoutDetails({ bankCode: "A1", branchCode: "", accountNumber: "1" });
  assert.equal(!letters.ok && letters.errors.bankCode, MSG.bankFormat);
});

check("branch code, when given, is 1 to 5 digits", () => {
  const long = validatePayoutDetails({ bankCode: "1", branchCode: "123456", accountNumber: "1" });
  assert.equal(!long.ok && long.errors.branchCode, MSG.branchFormat);
  const letters = validatePayoutDetails({ bankCode: "1", branchCode: "1x", accountNumber: "1" });
  assert.equal(!letters.ok && letters.errors.branchCode, MSG.branchFormat);
});

check("account number required, digits only, up to 28", () => {
  const empty = validatePayoutDetails({ bankCode: "1", branchCode: "", accountNumber: "" });
  assert.equal(!empty.ok && empty.errors.accountNumber, MSG.accountRequired);
  const over = validatePayoutDetails({ bankCode: "1", branchCode: "", accountNumber: "1".repeat(29) });
  assert.equal(!over.ok && over.errors.accountNumber, MSG.accountFormat);
  const dashes = validatePayoutDetails({ bankCode: "1", branchCode: "", accountNumber: "123-45" });
  assert.equal(!dashes.ok && dashes.errors.accountNumber, MSG.accountFormat);
});

check("all errors reported together", () => {
  const r = validatePayoutDetails({ bankCode: "", branchCode: "abc", accountNumber: "" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ["accountNumber", "bankCode", "branchCode"]);
});

check("mask shows last four digits only", () => {
  assert.equal(maskAccount("1234567890"), "•••• 7890");
  assert.equal(maskAccount("12"), "•••• 12");
});

console.log(`${passed} passed`);
