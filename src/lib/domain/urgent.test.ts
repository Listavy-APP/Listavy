import { test } from "node:test";
import assert from "node:assert/strict";
import { isUrgentScheduleAllowed, urgentFeeLabel, URGENT_FEE_DOP_DEFAULT } from "./urgent.ts";

test("urgent: ASAP and today are allowed; a future or past date is refused", () => {
  assert.equal(isUrgentScheduleAllowed(null, "2026-11-22"), true);
  assert.equal(isUrgentScheduleAllowed("2026-11-22", "2026-11-22"), true);
  assert.equal(isUrgentScheduleAllowed("2026-11-23", "2026-11-22"), false);
  assert.equal(isUrgentScheduleAllowed("2026-11-21", "2026-11-22"), false);
});

test("urgent: default fee is RD$500 and the label is plain Spanish with no promise of time", () => {
  assert.equal(URGENT_FEE_DOP_DEFAULT, 500);
  assert.equal(urgentFeeLabel(500), "Tarifa por urgencia: RD$500");
});
