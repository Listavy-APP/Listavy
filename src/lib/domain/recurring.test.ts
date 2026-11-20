// Recurring booking form rules (0096). Pure functions, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorProblem, defaultAnchor, frequencyLine } from "./recurring.ts";

test("anchor: weekday 0 to 6 for weekly and biweekly, day of month 1 to 31 for monthly", () => {
  assert.equal(anchorProblem("weekly", 0), false);
  assert.equal(anchorProblem("weekly", 6), false);
  assert.equal(anchorProblem("weekly", 7), true);
  assert.equal(anchorProblem("biweekly", -1), true);
  assert.equal(anchorProblem("monthly", 31), false);
  assert.equal(anchorProblem("monthly", 0), true);
  assert.equal(anchorProblem("monthly", 1.5), true);
});

test("default anchor: weekday of the Santo Domingo date, or day of month", () => {
  assert.equal(defaultAnchor("weekly", "2026-11-19"), 4, "Thursday");
  assert.equal(defaultAnchor("biweekly", "2026-11-22"), 0, "Sunday");
  assert.equal(defaultAnchor("monthly", "2026-11-19"), 19);
});

test("frequency line reads in Spanish and matches the stored rule", () => {
  assert.equal(frequencyLine("weekly", 1), "Cada lunes");
  assert.equal(frequencyLine("biweekly", 3), "Cada 2 semanas, el miércoles");
  assert.equal(frequencyLine("monthly", 31), "El día 31 de cada mes");
});
