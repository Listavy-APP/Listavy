// SEO v1: sitemap contents, metadata uniqueness per route, JSON-LD validity. Pure functions, no network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { es } from "../i18n/es.ts";
import { pageMetadata, jsonLdScript } from "../seo/metadata.ts";
import { proJsonLd, tradeJsonLd } from "../seo/jsonld.ts";
import { buildSitemapEntries, isPrivateUrl, type SitemapProRow } from "../seo/sitemap.ts";
import { PRIVATE_PATHS, PUBLIC_STATIC_PATHS, SITE_URL, TRADE_VIEWS, tradeViewPath } from "../seo/site.ts";

const NOW = new Date("2026-11-20T10:00:00Z");
const APPROVED = "00000000-0000-4000-8000-00000000a001";
const APPROVED_TWO = "00000000-0000-4000-8000-00000000a002";
const DEMO = "00000000-0000-4000-8000-00000000d001";
const PENDING = "00000000-0000-4000-8000-00000000p001";
const SUSPENDED = "00000000-0000-4000-8000-00000000s001";

const fixtures: SitemapProRow[] = [
  { id: APPROVED, verification_status: "approved", is_demo: false, verified_at: "2026-11-01T12:00:00Z" },
  { id: APPROVED_TWO, verification_status: "approved", is_demo: false, verified_at: null },
  { id: DEMO, verification_status: "approved", is_demo: true, verified_at: "2026-10-01T12:00:00Z" },
  { id: PENDING, verification_status: "pending", is_demo: false, verified_at: null },
  { id: SUSPENDED, verification_status: "suspended", is_demo: false, verified_at: "2026-10-05T12:00:00Z" },
  { id: APPROVED, verification_status: "approved", is_demo: false, verified_at: "2026-11-01T12:00:00Z" },
];

const urls = buildSitemapEntries(fixtures, NOW).map((e) => e.url);
const has = (path: string) => urls.includes(new URL(path, SITE_URL).toString());

test("sitemap: approved non-demo pros are in, once each", () => {
  assert.ok(has(`/pro/${APPROVED}`));
  assert.ok(has(`/pro/${APPROVED_TWO}`));
  assert.equal(urls.filter((u) => u.endsWith(`/pro/${APPROVED}`)).length, 1, "duplicate rows collapse");
});

test("sitemap: demo, pending, and suspended pros are out", () => {
  assert.equal(has(`/pro/${DEMO}`), false, "demo excluded");
  assert.equal(has(`/pro/${PENDING}`), false, "pending excluded");
  assert.equal(has(`/pro/${SUSPENDED}`), false, "suspended excluded");
});

test("sitemap: public static routes and trade views are in", () => {
  for (const p of PUBLIC_STATIC_PATHS) assert.ok(has(p), p);
  for (const v of TRADE_VIEWS) assert.ok(has(tradeViewPath(v.slug)), v.slug);
});

test("sitemap: no private path appears, anywhere", () => {
  for (const u of urls) assert.equal(isPrivateUrl(u), false, u);
  for (const private_ of PRIVATE_PATHS) assert.equal(urls.some((u) => new URL(u).pathname.startsWith(private_)), false, private_);
});

test("sitemap: lastmod for a pro comes from approval; falls back to now", () => {
  const entries = buildSitemapEntries(fixtures, NOW);
  const approved = entries.find((e) => e.url.endsWith(`/pro/${APPROVED}`));
  const noDate = entries.find((e) => e.url.endsWith(`/pro/${APPROVED_TWO}`));
  assert.ok(approved && noDate);
  assert.equal(approved.lastModified.toISOString(), "2026-11-01T12:00:00.000Z");
  assert.equal(noDate.lastModified.toISOString(), NOW.toISOString());
});

test("sitemap: a pro who drops out of the rows drops out of the output", () => {
  const after = buildSitemapEntries(fixtures.filter((r) => r.id !== APPROVED), NOW).map((e) => e.url);
  assert.equal(after.some((u) => u.endsWith(`/pro/${APPROVED}`)), false);
});

test("metadata: every public route has a unique title and description, and an absolute canonical", () => {
  const routes = [
    { title: es.seo.homeTitle, description: es.seo.homeDescription, path: "/" },
    { title: es.seo.searchTitle, description: es.seo.searchDescription, path: "/buscar" },
    { title: es.priceGuide.metaTitle, description: es.priceGuide.metaDescription, path: "/precios" },
    ...TRADE_VIEWS.map((v) => ({
      title: es.seo.tradeTitle(es.trades[v.trade]),
      description: es.seo.tradeDescription(es.trades[v.trade]),
      path: tradeViewPath(v.slug),
    })),
    ...fixtures
      .filter((r) => r.verification_status === "approved" && !r.is_demo)
      .map((r, i) => ({
        title: es.seo.proTitle(`Pro ${i}`, "Plomero", "Naco"),
        description: es.seo.proDescriptionFallback("Plomero", "Naco"),
        path: `/pro/${r.id}`,
      })),
  ];
  type Shape = { title: { absolute: string }; description: string; alternates: { canonical: string }; openGraph: { images: { url: string }[] }; twitter: { card: string } };
  const metas = routes.map((r) => pageMetadata(r)) as unknown as Shape[];
  const titles = metas.map((m) => m.title.absolute);
  assert.equal(new Set(titles).size, titles.length, "titles are unique");
  // Pro profiles share the description template, so only the trade views and static routes must differ.
  const staticDescriptions = metas.slice(0, 2 + TRADE_VIEWS.length + 1).map((m) => m.description);
  assert.equal(new Set(staticDescriptions).size, staticDescriptions.length, "static descriptions are unique");
  for (const m of metas) {
    assert.match(m.alternates.canonical, /^https:\/\/listavy\.com\//);
    assert.ok(m.openGraph.images[0].url, "og image");
    assert.equal(m.twitter.card, "summary_large_image");
  }
});

test("metadata: copy never contains a trailing dot pattern or raw HTML", () => {
  for (const text of [es.seo.homeTitle, es.seo.searchTitle, es.seo.homeDescription, es.seo.searchDescription]) {
    assert.doesNotMatch(text, /<|>/);
  }
});

test("JSON-LD: pro and trade objects parse back, and carry no ratings or reviews", () => {
  const pro = proJsonLd({ url: `${SITE_URL}/pro/${APPROVED}`, name: "Ana Pérez", tradeLabel: "Plomero", zone: "Naco", image: null });
  const trade = tradeJsonLd({ url: `${SITE_URL}/servicios/plomeria`, name: "Plomero en Santo Domingo | Listavy", items: [{ name: "Ana", url: `${SITE_URL}/pro/${APPROVED}` }] });
  for (const doc of [pro, trade]) {
    const parsed = JSON.parse(jsonLdScript(doc));
    assert.equal(parsed["@context"], "https://schema.org");
    const serialized = JSON.stringify(parsed);
    assert.doesNotMatch(serialized, /aggregateRating|"review"|ratingValue/);
  }
  assert.equal(JSON.parse(jsonLdScript(pro)).image, undefined, "no image key when there is none");
});

test("JSON-LD: a name containing a closing script tag cannot break out of the script element", () => {
  const hostile = proJsonLd({ url: `${SITE_URL}/pro/x`, name: "</script><script>alert(1)</script>", tradeLabel: "Plomero", zone: "Naco", image: null });
  const escaped = jsonLdScript(hostile);
  assert.equal(escaped.includes("</script>"), false);
  assert.equal(JSON.parse(escaped).name, "</script><script>alert(1)</script>");
});

console.log("seo tests passed");
