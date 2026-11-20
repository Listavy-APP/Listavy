import assert from "node:assert/strict";
import { test } from "node:test";
import { verifiedIconKind } from "./verifiedIcon.ts";

test("a person with cédula and selfie approved gets the person icon", () => {
  assert.equal(verifiedIconKind(["identity", "selfie"], false), "person");
});

test("a person with only one identity stage gets no icon", () => {
  assert.equal(verifiedIconKind(["identity"], false), null);
  assert.equal(verifiedIconKind(["selfie"], false), null);
});

test("a merely approved pro with no stages gets no icon", () => {
  assert.equal(verifiedIconKind([], false), null);
  assert.equal(verifiedIconKind(["buena_conducta", "insurance"], false), null);
});

test("a company gets the company icon only when its full set is complete", () => {
  assert.equal(verifiedIconKind(["company_entity", "company_registry", "representative", "buena_conducta"], true), "company");
  assert.equal(verifiedIconKind(["company_entity", "company_registry", "representative"], true), null);
});

test("a company is not shown the person icon from identity stages alone", () => {
  assert.equal(verifiedIconKind(["identity", "selfie"], true), null);
});

console.log("verified icon domain tests passed");
