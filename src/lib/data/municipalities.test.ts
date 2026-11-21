import assert from "node:assert/strict";
import { TIER_LABEL, approxDistance, groupByProvince, type Municipality } from "./municipalities.ts";

// Tier labels: one label per ladder tier, in Spanish, as approved.
assert.equal(TIER_LABEL[1], "En tu municipio");
assert.equal(TIER_LABEL[2], "En tu provincia");
assert.equal(TIER_LABEL[3], "Cerca de ti");
assert.equal(TIER_LABEL[4], "En el país");

// Distance: approximate, rounded to whole km, absent for tier 1 (null).
assert.equal(approxDistance(null), null);
assert.equal(approxDistance(0), "a unos 0 km");
assert.equal(approxDistance(42.4), "a unos 42 km");
assert.equal(approxDistance(42.6), "a unos 43 km");
assert.equal(approxDistance(160), "a unos 160 km");

// Grouping keeps list order and collects municipalities under their province.
const list: Municipality[] = [
  { id: "a", name: "Santo Domingo de Guzmán", province: "Distrito Nacional", legacyCity: "santo_domingo" },
  { id: "b", name: "Santiago de los Caballeros", province: "Santiago", legacyCity: "santiago" },
  { id: "c", name: "Tamboril", province: "Santiago", legacyCity: null },
];
const grouped = groupByProvince(list);
assert.deepEqual([...grouped.keys()], ["Distrito Nacional", "Santiago"]);
assert.deepEqual(grouped.get("Santiago")!.map((m) => m.id), ["b", "c"]);

console.log("municipalities: ok");
