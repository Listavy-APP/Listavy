import assert from "node:assert/strict";
import { groupByTrade, isBookable, isValidSlug, slugify, type FixedServiceRow } from "./fixed-service.ts";

assert.equal(slugify("Instalación de aire acondicionado (12,000 BTU)"), "instalacion-de-aire-acondicionado-12-000-btu");
assert.equal(slugify("  Destape de tubería  "), "destape-de-tuberia");
assert.equal(slugify("¡Pintura!"), "pintura");
assert.equal(slugify("---"), "");

assert.equal(isValidSlug("destape-de-tuberia"), true);
assert.equal(isValidSlug("a"), false);
assert.equal(isValidSlug("Con-Mayus"), false);
assert.equal(isValidSlug("con_guion_bajo"), false);

const rows = [
  { id: "1", trade: "plumber" },
  { id: "2", trade: "ac_technician" },
  { id: "3", trade: "plumber" },
];
const grouped = groupByTrade(rows);
assert.deepEqual([...grouped.keys()], ["plumber", "ac_technician"]);
assert.deepEqual(grouped.get("plumber")!.map((r) => r.id), ["1", "3"]);

const svc = (over: Partial<FixedServiceRow>): FixedServiceRow => ({
  id: "s1", trade: "plumber", slug: "destape", name_es: "Destape", includes_es: "Alcance de prueba.",
  price_dop: 2500, active: true, sort_order: 1000, ...over,
});
assert.equal(isBookable(svc({}), new Set(["s1"])), true);
assert.equal(isBookable(svc({}), new Set()), false, "not opted in");
assert.equal(isBookable(svc({ active: false }), new Set(["s1"])), false, "inactive");

console.log("fixed-service: ok");
