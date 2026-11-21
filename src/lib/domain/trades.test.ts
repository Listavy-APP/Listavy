// Trades catalog helpers (0109). Pins the seven existing display strings: a change there is a defect.
import assert from "node:assert/strict";
import { test } from "node:test";
import { labelOf, proLabelOf, tradeMap, toCatalogTrade, type CatalogTrade } from "../data/trades.ts";

// Today's strings, exactly as they were before the catalog (category tiles and professional names).
const EXISTING: Array<{ key: string; label: string; proLabel: string }> = [
  { key: "plumber", label: "Plomería", proLabel: "Plomero" },
  { key: "electrician", label: "Electricidad", proLabel: "Electricista" },
  { key: "ac_technician", label: "Aire acondicionado", proLabel: "Técnico de aire acondicionado" },
  { key: "painter", label: "Pintura", proLabel: "Pintor" },
  { key: "locksmith", label: "Cerrajería", proLabel: "Cerrajero" },
  { key: "carpenter", label: "Carpintería", proLabel: "Carpintero" },
  { key: "blacksmith", label: "Herrería", proLabel: "Herrero" },
];

const rowFor = (e: (typeof EXISTING)[number]) => ({
  key: e.key,
  label_es: e.label,
  pro_label_es: e.proLabel,
  slug: e.key,
  specialties: [],
});

test("existing trades keep their exact display strings in both contexts", () => {
  for (const e of EXISTING) {
    const t = toCatalogTrade(rowFor(e));
    assert.equal(t.label, e.label, `${e.key} category`);
    assert.equal(t.proLabel, e.proLabel, `${e.key} professional`);
  }
});

test("a new line has no professional name: the line name is used", () => {
  const t = toCatalogTrade({ key: "cleaning", label_es: "Limpieza", pro_label_es: null, slug: "limpieza", specialties: ["Cisternas y tinacos"] });
  assert.equal(t.proLabel, "Limpieza");
  assert.deepEqual(t.specialties, ["Cisternas y tinacos"]);
});

test("lookups fall back to the key for an unknown trade, and to empty for none", () => {
  const map = tradeMap(EXISTING.map((e) => toCatalogTrade(rowFor(e))) as CatalogTrade[]);
  assert.equal(proLabelOf(map, "plumber"), "Plomero");
  assert.equal(labelOf(map, "plumber"), "Plomería");
  assert.equal(proLabelOf(map, "zz_unknown"), "zz_unknown");
  assert.equal(proLabelOf(map, null), "");
});
