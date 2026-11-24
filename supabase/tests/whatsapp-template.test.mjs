// Run: node --experimental-strip-types supabase/tests/whatsapp-template.test.mjs
// Pins the variable count and order per kind against the approved Meta bodies (5b, 2026-11-24).
// The check reads the seed from migration 0118, so the migration and this list cannot drift apart.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildContentVariables,
  firstName,
  formatDop,
  kindConfig,
  scheduleLabel,
} from "../functions/_shared/whatsapp-template.ts";

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`ok - ${name}`); };

// Approved order per kind. Position n in ContentVariables is the nth entry here.
const APPROVED = {
  job_quote_received: ["first_name", "pro_name", "trade", "amount"],
  job_accepted: ["first_name", "trade", "pro_name", "schedule"],
  job_arrived: ["first_name", "pro_name", "trade"],
  job_started: ["first_name", "pro_name", "trade"],
  job_completed: ["first_name", "pro_name", "trade"],
  receipt: ["amount", "trade", "pro_name"],
  job_cancelled_refund: ["first_name", "trade", "refund"],
  dispute_decided: ["first_name", "trade"],
  request_invite: ["first_name", "trade", "municipality", "zone"],
  quote_accepted: ["first_name", "client_name", "trade", "amount"],
  payout_released: ["first_name", "amount", "trade"],
};

const sql = readFileSync(new URL("../migrations/0118_whatsapp_job_events.sql", import.meta.url), "utf8");
const seedJson = sql.match(/values \('whatsapp_templates', '([\s\S]*?)'::jsonb\)/)?.[1];
assert.ok(seedJson, "seed row not found in 0118");
const seed = JSON.parse(seedJson);

check("the seed covers exactly the 11 approved kinds", () => {
  assert.deepEqual(Object.keys(seed.kinds).sort(), Object.keys(APPROVED).sort());
});

for (const kind of Object.keys(APPROVED)) {
  check(`${kind}: ${APPROVED[kind].length} variables in the approved order`, () => {
    assert.deepEqual(seed.kinds[kind].vars, APPROVED[kind]);
    assert.equal(seed.kinds[kind].vars.length, APPROVED[kind].length);
  });
}

check("dispute_decided carries no outcome variable (the result stays in-app)", () => {
  assert.ok(!seed.kinds.dispute_decided.vars.includes("outcome"));
});

check("receipt has no greeting variable", () => {
  assert.ok(!seed.kinds.receipt.vars.includes("first_name"));
});

check("every kind is es_MX with a Twilio content SID", () => {
  for (const [kind, k] of Object.entries(seed.kinds)) {
    assert.equal(k.language, "es_MX", kind);
    assert.ok(/^HX[0-9a-f]{32}$/.test(k.sid), `${kind} sid`);
  }
});

check("the 11 SIDs are the approved ones, one each", () => {
  const sids = Object.values(seed.kinds).map((k) => k.sid);
  assert.equal(new Set(sids).size, 11);
});

const cfg = { messaging_service_sid: seed.messaging_service_sid, kinds: seed.kinds };

check("variables are positional from 1, in the configured order", () => {
  const out = buildContentVariables(seed.kinds.job_quote_received.vars, {
    first_name: "Ana", pro_name: "Juan", trade: "Plomero", amount: "RD$1,500",
  });
  assert.deepEqual(out, { "1": "Ana", "2": "Juan", "3": "Plomero", "4": "RD$1,500" });
});

check("a missing configured value refuses the send", () => {
  assert.equal(buildContentVariables(["first_name", "amount"], { first_name: "Ana" }), null);
});

check("a blank pro name refuses the send (only the first name may be blank)", () => {
  assert.equal(buildContentVariables(["first_name", "pro_name"], { first_name: "Ana", pro_name: "" }), null);
});

check("a blank first name is allowed", () => {
  assert.deepEqual(buildContentVariables(["first_name"], { first_name: "" }), { "1": "" });
});

check("kindConfig returns a configured kind and refuses an unknown one", () => {
  assert.equal(kindConfig(cfg, "job_accepted").language, "es_MX");
  assert.equal(kindConfig(cfg, "unknown_kind"), null);
});

check("formatDop matches the app's peso format and rejects non-numbers", () => {
  assert.equal(formatDop(1500), "RD$1,500");
  assert.equal(formatDop(undefined), "");
  assert.equal(formatDop("1500"), "");
});

check("firstName takes the first word and tolerates no name", () => {
  assert.equal(firstName("María Pérez"), "María");
  assert.equal(firstName(null), "");
});

check("scheduleLabel maps morning, afternoon and evening to mañana, tarde and noche", () => {
  // 2026-11-24 is a Tuesday (computed by Intl, not hard-coded from the weekday).
  assert.equal(scheduleLabel("2026-11-24", "morning"), "martes 24 de noviembre, en la mañana");
  assert.equal(scheduleLabel("2026-11-24", "afternoon"), "martes 24 de noviembre, en la tarde");
  assert.equal(scheduleLabel("2026-11-24", "evening"), "martes 24 de noviembre, en la noche");
});

check("scheduleLabel keeps the calendar day (no time-zone shift)", () => {
  assert.equal(scheduleLabel("2026-11-30", "morning"), "lunes 30 de noviembre, en la mañana");
});

check("scheduleLabel is empty when the date or window is missing or invalid", () => {
  assert.equal(scheduleLabel(null, "morning"), "");
  assert.equal(scheduleLabel("2026-11-24", null), "");
  assert.equal(scheduleLabel("2026-11-24", "night"), "");
  assert.equal(scheduleLabel("not a date", "morning"), "");
});

check("the sender reads the job's date and window, not the quote", () => {
  const fn = readFileSync(new URL("../functions/send-whatsapp/index.ts", import.meta.url), "utf8");
  assert.match(fn, /scheduled_date, scheduled_window/);
  assert.match(fn, /scheduleLabel\(scheduledDate, scheduledWindow\)/);
  assert.ok(!/window_start|approved_quote_id/.test(fn), "no quote window read");
});

check("ASAP skip: a schedule template with no scheduled date is skipped, not failed", () => {
  const fn = readFileSync(new URL("../functions/send-whatsapp/index.ts", import.meta.url), "utf8");
  assert.match(fn, /entry\.vars\.includes\("schedule"\) && !values\.schedule/);
  assert.match(fn, /log\("skipped_no_schedule"\)/);
});

check("0122 adds skipped_no_schedule to the log status check", () => {
  const sql = readFileSync(new URL("../migrations/0122_whatsapp_skip_no_schedule.sql", import.meta.url), "utf8");
  assert.match(sql, /'skipped_no_schedule'\)/);
});

check("the sender holds no template wording", () => {
  const fn = readFileSync(new URL("../functions/send-whatsapp/index.ts", import.meta.url), "utf8");
  assert.ok(!/Hola|Recibiste una cotización/.test(fn));
});

console.log(`${passed} passed`);
