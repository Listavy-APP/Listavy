// Nudge selection for the pro checklist (8c). Pure function, no network.
import assert from "node:assert/strict";
import { doneCount, nudgeFor, type ChecklistRow } from "./proChecklist.ts";

const row = (over: Partial<ChecklistRow>): ChecklistRow => ({
  item: "foto", state: "missing", visibility: "public", priority: 2, dismissed: false, ...over,
});

// Verification first while unapproved, then foto, then pago.
const bare: ChecklistRow[] = [
  row({ item: "verificacion", priority: 1 }),
  row({ item: "foto", priority: 2 }),
  row({ item: "pago", visibility: "private", priority: 3 }),
  row({ item: "descripcion", priority: 4 }),
  row({ item: "horario", priority: 5 }),
  row({ item: "precios", state: "done", priority: null }),
  row({ item: "zona", state: "done", priority: null }),
];

assert.equal(nudgeFor(bare)?.item, "verificacion", "bare pro: verification is the top item");

const verifiedApproved = bare.map((r) => (r.item === "verificacion" ? { ...r, state: "done" as const, priority: null } : r));
assert.equal(nudgeFor(verifiedApproved)?.item, "foto", "approved pro: no verification nudge");

const inReview = bare.map((r) => (r.item === "verificacion" ? { ...r, state: "pending" as const } : r));
assert.equal(nudgeFor(inReview)?.item, "foto", "documents under review are not nudged");

assert.equal(nudgeFor(bare.map((r) => ({ ...r, dismissed: r.item === "verificacion" })))?.item, undefined, "dismissed top item hides the nudge");
assert.equal(nudgeFor(bare.map((r) => ({ ...r, dismissed: r.item === "verificacion" })))?.item ?? null, null);

const complete = bare.map((r) => ({ ...r, state: "done" as const, priority: null }));
assert.equal(nudgeFor(complete), null, "complete pro: no nudge");

assert.deepEqual(doneCount(bare), { done: 2, total: 7 });
console.log("proChecklist tests passed");
