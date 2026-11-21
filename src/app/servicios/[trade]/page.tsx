import { proLabelOf } from "@/lib/data/trades";
import { getTradeCatalog, getTradeMap } from "@/lib/data/trades-server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { BackArrow } from "@/components/BackBar";
import { listProCards } from "@/lib/data/pros";
import { es } from "@/lib/i18n/es";
import { DEFAULT_CITY } from "@/lib/domain/catalog";
import { pageMetadata, jsonLdScript } from "@/lib/seo/metadata";
import { tradeJsonLd } from "@/lib/seo/jsonld";
import { absoluteUrl, tradeViewPath } from "@/lib/seo/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Live pro list: render per request, same convention as the other data pages.
export const instant = false;

type Params = Promise<{ trade: string }>;

/** The catalog trade for a URL slug, or null (404). */
async function viewFor(slug: string) {
  const catalog = await getTradeCatalog();
  const hit = catalog.find((t) => t.slug === slug);
  return hit ? { slug: hit.slug, trade: hit.key } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const tm = await getTradeMap();
  await connection();
  const { trade: slug } = await params;
  const view = await viewFor(slug);
  if (!view) return { title: es.search.title, robots: { index: false } };
  const label = proLabelOf(tm, view.trade);
  return pageMetadata({
    title: es.seo.tradeTitle(label),
    description: es.seo.tradeDescription(label),
    path: tradeViewPath(view.slug),
  });
}

/** Request-time like /pro/[id]: the pro list is live data. */
export default async function TradeViewPage({ params }: { params: Params }) {
  await connection();
  return (
    <Suspense fallback={<section className="stack" aria-busy="true" />}>
      <TradeList params={params} />
    </Suspense>
  );
}

async function TradeList({ params }: { params: Params }) {
  const tm = await getTradeMap();
  const { trade: slug } = await params;
  const view = await viewFor(slug);
  if (!view) notFound();

  const label = proLabelOf(tm, view.trade);
  const supabase = await createSupabaseServerClient();
  const pros = (await listProCards(supabase, { trade: view.trade, city: DEFAULT_CITY })).filter((p) => !p.is_demo);
  const path = tradeViewPath(view.slug);

  const items = pros.map((p) => ({ name: p.full_name ?? label, url: absoluteUrl(`/pro/${p.id}`) }));
  const json = tradeJsonLd({ url: absoluteUrl(path), name: es.seo.tradeTitle(label), items });

  return (
    <section className="stack">
      <div className="backbar">
        <Link className="back" href="/" aria-label={es.common.back}><BackArrow /></Link>
        <span className="bt">{label}</span>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(json) }} />
      <h1 className="page-title">{label} en Santo Domingo</h1>
      <p className="lead">{es.seo.serviceIntro(label)}</p>
      <Link className="button" href={`/buscar?trade=${view.trade}`}>
        {es.seo.serviceCta}
      </Link>
      <h2>{es.seo.serviceListLabel}</h2>
      {items.length === 0 ? (
        <p className="muted">{es.seo.serviceListEmpty}</p>
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {pros.map((p) => (
            <li key={p.id}>
              <Link className="panel" href={`/pro/${p.id}`} style={{ display: "block", minHeight: 44 }}>
                <strong>{p.full_name ?? label}</strong>
                <span className="muted"> · {p.zone}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
