import { absoluteUrl, PRIVATE_PATHS, PUBLIC_STATIC_PATHS, TRADE_VIEWS, tradeViewPath } from "./site.ts";

/** Pro rows the sitemap reads: approved and non-demo only. The query filters; this rebuilds the rule. */
export type SitemapProRow = { id: string; verification_status: string; is_demo: boolean; verified_at: string | null };
export type SitemapEntry = { url: string; lastModified: Date };

/** Pure builder. Public static routes, trade views, and approved non-demo pro profiles. Never private paths. */
export function buildSitemapEntries(pros: SitemapProRow[], now: Date): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const path of PUBLIC_STATIC_PATHS) entries.push({ url: absoluteUrl(path), lastModified: now });
  for (const view of TRADE_VIEWS) entries.push({ url: absoluteUrl(tradeViewPath(view.slug)), lastModified: now });

  const seen = new Set<string>();
  for (const row of pros) {
    if (row.verification_status !== "approved" || row.is_demo) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    entries.push({ url: absoluteUrl(`/pro/${row.id}`), lastModified: new Date(row.verified_at ?? now) });
  }

  return entries.filter((e) => !isPrivateUrl(e.url));
}

/** True when a URL's path sits under a private area. Used as a last check before output. */
export function isPrivateUrl(url: string): boolean {
  const path = new URL(url).pathname;
  return PRIVATE_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}
