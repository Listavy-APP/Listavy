import assert from "node:assert/strict";
import { test } from "node:test";
import { filterPros } from "./discovery.ts";

const pros = [
  { id: "a", available: true },   // icon shown (identity + selfie)
  { id: "b", available: true },   // approved only: no icon, must be excluded by the filter
  { id: "c", available: false },  // icon shown, not available
];
const verifiedIds = new Set(["a", "c"]);

test("with the verified filter off, every pro is kept", () => {
  assert.deepEqual(filterPros(pros, { verifiedOnly: false, availableOnly: false, verifiedIds }).map((p) => p.id), ["a", "b", "c"]);
});

test("the verified filter keeps exactly the pros the icon shows", () => {
  assert.deepEqual(filterPros(pros, { verifiedOnly: true, availableOnly: false, verifiedIds }).map((p) => p.id), ["a", "c"]);
});

test("verified and available combine", () => {
  assert.deepEqual(filterPros(pros, { verifiedOnly: true, availableOnly: true, verifiedIds }).map((p) => p.id), ["a"]);
});

console.log("discovery filter tests passed");
