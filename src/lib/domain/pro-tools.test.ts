// Run: node --experimental-strip-types src/lib/domain/pro-tools.test.ts
import assert from "node:assert/strict";
import { barPercent, grossFromNet, validateTemplate } from "./pro-tools.ts";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check("gross from net: net 2600, commission 400, tip 100 gives gross 2900", () => {
  assert.equal(grossFromNet(2600, 400, 100), 2900);
  assert.equal(grossFromNet(2600, 400, 0), 3000);
});

check("bars: scale to the largest month, zero stays zero, never above 100", () => {
  assert.equal(barPercent(50, 100), 50);
  assert.equal(barPercent(100, 100), 100);
  assert.equal(barPercent(0, 100), 0);
  assert.equal(barPercent(10, 0), 0);
  assert.equal(barPercent(-5, 100), 0);
  assert.equal(barPercent(150, 100), 100);
});

check("template: trims title and note, reads amount digits, empty note becomes null", () => {
  const r = validateTemplate({ title: "  Cambio de llave ", amount: "RD$ 1,800", note: "  Incluye mano de obra " });
  assert.deepEqual(r, { ok: true, value: { title: "Cambio de llave", amountDop: 1800, note: "Incluye mano de obra" } });
  const n = validateTemplate({ title: "Visita", amount: "900", note: "   " });
  assert.deepEqual(n, { ok: true, value: { title: "Visita", amountDop: 900, note: null } });
});

check("template: refuses empty title, zero amount, and a note over 1000 letters", () => {
  assert.equal(validateTemplate({ title: "   ", amount: "100", note: "" }).ok, false);
  assert.equal(validateTemplate({ title: "x", amount: "0", note: "" }).ok, false);
  assert.equal(validateTemplate({ title: "x", amount: "", note: "" }).ok, false);
  assert.equal(validateTemplate({ title: "x".repeat(61), amount: "100", note: "" }).ok, false);
  assert.equal(validateTemplate({ title: "x", amount: "100", note: "n".repeat(1001) }).ok, false);
});

console.log(`\n${passed} passed`);
