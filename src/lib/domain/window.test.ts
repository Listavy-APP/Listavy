// Run: node --experimental-strip-types src/lib/domain/window.test.ts
import assert from "node:assert/strict";
import { formatWindow } from "./window.ts";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const countNov = (s: string) => (s.match(/nov/gi) ?? []).length;

check("a same-day window shows the date once", () => {
  assert.equal(countNov(formatWindow("2026-11-12T13:00:00Z", "2026-11-12T15:00:00Z")), 1);
});
check("a multi-day window shows both dates", () => {
  assert.equal(countNov(formatWindow("2026-11-12T13:00:00Z", "2026-11-13T15:00:00Z")), 2);
});
check("late evening in UTC is still the same Santo Domingo day", () => {
  // 02:00Z and 03:00Z on Nov 13 are 22:00 and 23:00 on Nov 12 in UTC-4.
  assert.equal(countNov(formatWindow("2026-11-13T02:00:00Z", "2026-11-13T03:00:00Z")), 1);
});
check("the same instant formats the same on every run", () => {
  assert.equal(formatWindow("2026-11-12T13:00:00Z", "2026-11-12T15:00:00Z"), formatWindow("2026-11-12T13:00:00Z", "2026-11-12T15:00:00Z"));
});

console.log(`\n${passed} window checks passed.`);
