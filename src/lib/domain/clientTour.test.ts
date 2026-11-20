import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldShowClientTour, tourFinishAction } from "./clientTour.ts";

const T = "2026-11-01T10:00:00Z";

test("a new client sees the tour once", () => {
  assert.equal(shouldShowClientTour({ role: "homeowner", client_tour_completed_at: null }, false), true);
});

test("a client who finished or skipped never sees it again", () => {
  assert.equal(shouldShowClientTour({ role: "homeowner", client_tour_completed_at: T }, false), false);
});

test("a pro-only account never sees it", () => {
  assert.equal(shouldShowClientTour({ role: "pro", client_tour_completed_at: null }, false), false);
});

test("a dual-role pro with client jobs sees it once", () => {
  assert.equal(shouldShowClientTour({ role: "pro", client_tour_completed_at: null }, true), true);
  assert.equal(shouldShowClientTour({ role: "pro", client_tour_completed_at: T }, true), false);
});

test("admins never see it", () => {
  assert.equal(shouldShowClientTour({ role: "admin", client_tour_completed_at: null }, true), false);
});

test("a missing flag fails open: no tour, no trap", () => {
  assert.equal(shouldShowClientTour({ role: "homeowner" }, false), false);
});

test("finishing a first run stamps; a replay never does", () => {
  assert.equal(tourFinishAction("first"), "stamp");
  assert.equal(tourFinishAction("replay"), "none");
});

console.log("client tour domain tests passed");
