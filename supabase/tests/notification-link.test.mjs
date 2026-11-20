// Deep links stored with sent notifications (0098). Pure functions, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkFor, safeLink } from "../functions/_shared/notification-copy.ts";

const JOB = "7ee9a0f2-2855-4fbb-92d5-871588eb31a6";
const TICKET = "94a22f5b-50b5-4261-aa65-ca313456b5a0";

test("support replies link to the ticket, or to the ticket list without a valid id", () => {
  assert.equal(linkFor("support_reply", { ticket_id: TICKET }), `/ayuda/tickets/${TICKET}`);
  assert.equal(linkFor("support_reply", { ticket_id: "not-an-id" }), "/ayuda/tickets");
});

test("job kinds link to the job; recurring kinds link to Recurrentes", () => {
  assert.equal(linkFor("job_paid", { job_id: JOB }), `/trabajos/${JOB}`);
  assert.equal(linkFor("recurring_auto_paused", {}), "/cuenta/recurrentes");
});

test("ids that are not UUIDs never reach a link", () => {
  assert.equal(linkFor("job_paid", { job_id: "../../admin" }), null);
  assert.equal(linkFor("welcome", {}), null);
});

test("safeLink accepts internal paths only", () => {
  assert.equal(safeLink("/trabajos/x"), "/trabajos/x");
  assert.equal(safeLink("//evil.example"), null);
  assert.equal(safeLink("https://evil.example"), null);
  assert.equal(safeLink(undefined), null);
});
