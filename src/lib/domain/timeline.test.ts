// Run: node --experimental-strip-types src/lib/domain/timeline.test.ts
import assert from "node:assert/strict";
import { jobTimeline } from "./timeline.ts";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const states = (status: string, pay = "unpaid") => jobTimeline(status, pay).steps.map((s) => s.state);

check("a new request waits on quotes", () => {
  assert.deepEqual(states("requested"), ["done", "current", "todo", "todo", "todo", "todo"]);
});
check("quoted is the same step as requested", () => {
  assert.deepEqual(states("quoted"), states("requested"));
});
check("approved but unpaid waits on payment", () => {
  assert.deepEqual(states("accepted", "unpaid"), ["done", "done", "done", "current", "todo", "todo"]);
});
check("paid and accepted waits for the pro to start", () => {
  assert.deepEqual(states("accepted", "paid"), ["done", "done", "done", "done", "current", "todo"]);
});
check("in progress and awaiting approval share the in-progress step", () => {
  const expected = ["done", "done", "done", "done", "current", "todo"];
  assert.deepEqual(states("in_progress", "paid"), expected);
  assert.deepEqual(states("awaiting_approval", "paid"), expected);
});
check("completed has no current step", () => {
  assert.deepEqual(states("completed", "paid"), ["done", "done", "done", "done", "done", "done"]);
});
check("cancelled and disputed leave the path", () => {
  assert.deepEqual(jobTimeline("cancelled", "unpaid"), { steps: [], terminal: "cancelled" });
  assert.deepEqual(jobTimeline("disputed", "paid"), { steps: [], terminal: "disputed" });
});
check("an unknown status falls back to the first step", () => {
  assert.deepEqual(states("something_new"), ["done", "current", "todo", "todo", "todo", "todo"]);
});

console.log(`\n${passed} timeline checks passed.`);
