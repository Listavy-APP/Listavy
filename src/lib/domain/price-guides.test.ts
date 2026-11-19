import assert from "node:assert/strict";
import { DIAGNOSTIC_BAND_DOP, GUIDE_MIN_SAMPLE, formatRange, guideFor, type PriceGuideRow } from "./price-guides.ts";

const rows: PriceGuideRow[] = [
  { trade: "plumber", sample: 2, low_dop: null, high_dop: null },
  { trade: "electrician", sample: 3, low_dop: 1500, high_dop: 3000 },
  { trade: "painter", sample: 0, low_dop: null, high_dop: null },
];

assert.equal(GUIDE_MIN_SAMPLE, 3);
assert.equal(guideFor(rows, "plumber"), null, "2 pros: no guide");
assert.deepEqual(guideFor(rows, "electrician"), { sample: 3, low: 1500, high: 3000 }, "3 pros: guide");
assert.equal(guideFor(rows, "painter"), null, "no pros: no guide");
assert.equal(guideFor(rows, "locksmith"), null, "unknown trade: no guide");
assert.equal(guideFor([{ trade: "x", sample: 4, low_dop: null, high_dop: null }], "x"), null, "missing numbers: no guide");
assert.equal(formatRange(1500, 3000, (n) => `RD$${n}`), "RD$1500 – RD$3000");
assert.deepEqual(DIAGNOSTIC_BAND_DOP, { min: 500, max: 1000 });
console.log("price-guides: 7 checks passed");
