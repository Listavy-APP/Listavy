// Run: node --experimental-strip-types supabase/tests/whatsapp-template.test.mjs
// Covers the pure variable mapping used by send-whatsapp (0118). The settings seed is checked against the 11 SIDs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildContentVariables,
  firstName,
  formatDop,
  kindConfig,
  outcomeText,
} from "../functions/_shared/whatsapp-template.ts";

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`ok - ${name}`); };

const cfg = { messaging_service_sid: "MG3207aabe65c67f1b480f6ba7c8b6b55c", kinds: {
  job_quote_received: { sid: "HX61fd01bafcaeaee12d10b29477818a25", language: "es_MX", vars: ["first_name", "trade", "amount"] },
} };

check("variables are positional from 1, in configured order", () => {
  const out = buildContentVariables(["first_name", "trade", "amount"], { first_name: "Ana", trade: "Plomero", amount: "RD$1,500" });
  assert.deepEqual(out, { "1": "Ana", "2": "Plomero", "3": "RD$1,500" });
});

check("a missing configured value refuses the send instead of sending a blank", () => {
  assert.equal(buildContentVariables(["first_name", "amount"], { first_name: "Ana" }), null);
});

check("an empty name is allowed (sent as an empty string), not dropped", () => {
  assert.deepEqual(buildContentVariables(["first_name"], { first_name: "" }), { "1": "" });
});

check("kindConfig returns a configured kind and refuses an unknown one", () => {
  assert.equal(kindConfig(cfg, "job_quote_received").language, "es_MX");
  assert.equal(kindConfig(cfg, "unknown_kind"), null);
});

check("kindConfig refuses a SID that is not a Twilio content SID", () => {
  assert.equal(kindConfig({ kinds: { x: { sid: "bad", language: "es_MX", vars: [] } } }, "x"), null);
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

check("outcomeText uses the email wording and has a fallback", () => {
  assert.equal(outcomeText("resolved_pro"), "El caso se resolvió a favor del profesional.");
  assert.equal(outcomeText("other"), "Se tomó una decisión sobre la disputa.");
});

check("settings seed holds all 11 approved SIDs, each tagged es_MX", () => {
  const sql = readFileSync(new URL("../migrations/0118_whatsapp_job_events.sql", import.meta.url), "utf8");
  const sids = [
    "HX61fd01bafcaeaee12d10b29477818a25", "HXeb5f0c4550613e98ec9cb415d66f5b5a", "HXdbc26e939fc8f469fefc800c4ca2b8dc",
    "HXf6e3949e2f2e255887125a36e24729ac", "HX6d5d8e1aaa526808f61077cc2f81c933", "HXc98811ec4a3412c54beac039a1438cbf",
    "HXdf87df4c9f7bbbb4c8881135b98d352f", "HXb51020aea17ec657e4ea9beb2bc360a5", "HX7d2c737fe4c49a72f29414ea0948b8fa",
    "HXf61587352398faad29276111d9c95959", "HX24552f24b4204eadc08854ed50f5fe99",
  ];
  for (const sid of sids) assert.ok(sql.includes(sid), `missing ${sid}`);
  assert.equal((sql.match(/"language": "es_MX"/g) ?? []).length, 11);
  assert.equal((sql.match(/"sid": "HX/g) ?? []).length, 11);
});

check("the settings seed is in the migration, and the repo holds no template body text", () => {
  const fn = readFileSync(new URL("../functions/send-whatsapp/index.ts", import.meta.url), "utf8");
  assert.ok(!/Hola|Recibiste una cotización/.test(fn), "template wording must not be in the function");
});

console.log(`${passed} passed`);
