// Email copy for the recurring auto-pause event (0096). Pure function, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderEmail } from "../functions/_shared/notification-copy.ts";

test("auto-pause email: Spanish, names the trade, links to Recurrentes, no hover-only text", () => {
  const email = renderEmail("recurring_auto_paused", { trade: "plumber" }, { appUrl: "https://listavy.test", name: "Ana Pérez" });
  assert.ok(email, "kind is registered");
  assert.equal(email.subject, "Pausamos tu trabajo recurrente");
  assert.match(email.text, /^Hola Ana,/);
  assert.match(email.text, /Plomero/);
  assert.match(email.text, /https:\/\/listavy\.test\/cuenta\/recurrentes/);
});

test("unknown kinds still render nothing", () => {
  assert.equal(renderEmail("no_such_kind", {}, { appUrl: "https://listavy.test", name: null }), null);
});
