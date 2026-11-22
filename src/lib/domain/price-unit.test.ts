import assert from "node:assert/strict";
import { PRICE_UNITS, isJobUnit, isPriceUnit } from "./price-unit.ts";

assert.deepEqual([...PRICE_UNITS], ["job", "hour", "visit"]);
for (const u of PRICE_UNITS) assert.equal(isPriceUnit(u), true, u);
assert.equal(isPriceUnit("day"), false);
assert.equal(isPriceUnit(""), false);
assert.equal(isPriceUnit(null), false);
assert.equal(isJobUnit("job"), true);
assert.equal(isJobUnit("hour"), false);
assert.equal(isJobUnit("visit"), false);
assert.equal(isJobUnit(undefined), false);

console.log("price-unit: ok");
