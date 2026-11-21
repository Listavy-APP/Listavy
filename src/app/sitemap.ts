import { createClient } from "@supabase/supabase-js";
import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { buildSitemapEntries, type SitemapProRow } from "@/lib/seo/sitemap";

const PAGE = 1000;

/**
 * Reads on every request, so a pro who leaves approval drops out of the next crawl.
 * Anon role: 0086 grants the public columns and the pros policy already limits rows to approved, open pros.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const supabase = createClient(supabaseUrl(), supabaseAnonKey(), { auth: { persistSession: false } });

  const pros: SitemapProRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("pros")
      .select("id, verification_status, is_demo, verified_at")
      .eq("verification_status", "approved")
      .eq("is_demo", false)
      .order("id")
      .range(from, from + PAGE - 1);
    // Fail loudly: a partial sitemap would silently drop pros from search.
    if (error) throw new Error(`sitemap: no se pudieron leer los profesionales: ${error.message}`);
    pros.push(...((data ?? []) as SitemapProRow[]));
    if ((data ?? []).length < PAGE) break;
  }

  // Active catalog trades (public read, 0109). Each one gets a /servicios page.
  const { data: tradeRows, error: tErr } = await supabase.from("trades").select("slug").eq("active", true);
  if (tErr) throw new Error(`sitemap: no se pudieron leer los oficios: ${tErr.message}`);

  return buildSitemapEntries(pros, new Date(), (tradeRows ?? []) as { slug: string }[]);
}
