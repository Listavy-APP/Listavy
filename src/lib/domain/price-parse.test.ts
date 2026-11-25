// Price parsing for the registration wizard. Run with: node --experimental-strip-types src/lib/domain/price-parse.test.ts
import assert from "node:assert/strict";
import { parsePriceDop } from "../domain/price-parse.ts";

const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`ok - ${name}`); } catch (e) { console.error(`not ok - ${name}`); throw e; }
};

check("typed as Dominicans write it: plain, thousands comma, space, decimal", () => {
  assert.equal(parsePriceDop("1800"), 1800);
  assert.equal(parsePriceDop("1,800"), 1800);
  assert.equal(parsePriceDop("1 800"), 1800);
  assert.equal(parsePriceDop("1800.50"), 1801);
  assert.equal(parsePriceDop("0"), 0);
});

check("rejects empty, letters, and signs", () => {
  assert.equal(parsePriceDop(""), null);
  assert.equal(parsePriceDop("RD$1800"), null);
  assert.equal(parsePriceDop("-5"), null);
  assert.equal(parsePriceDop("1..5"), null);
});
