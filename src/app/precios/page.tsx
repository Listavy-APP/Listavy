import { Suspense } from "react";
import { connection } from "next/server";
import { es } from "@/lib/i18n/es";
import { pageMetadata } from "@/lib/seo/metadata";
import { getTradeCatalog } from "@/lib/data/trades-server";
import { DIAGNOSTIC_BAND_DOP, formatRange, guideFor, type PriceGuideRow } from "@/lib/domain/price-guides";
import { listPriceGuides } from "@/lib/data/price-guides";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BackBar } from "@/components/BackBar";

export const metadata = pageMetadata({
  title: es.priceGuide.metaTitle,
  description: es.priceGuide.metaDescription,
  path: "/precios",
});

/** Public page. Shows aggregates only, one section per trade. Per-request render, as on the home page. */
export default function PriceGuidePage() {
  return (
    <Suspense fallback={<div aria-busy="true" />}>
      <PriceGuideContent />
    </Suspense>
  );
}

async function PriceGuideContent() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const catalog = await getTradeCatalog();
  let rows: PriceGuideRow[] | null = null;
  try {
    rows = await listPriceGuides(supabase);
  } catch {
    rows = null;
  }
  const diagnostic = formatRange(DIAGNOSTIC_BAND_DOP.min, DIAGNOSTIC_BAND_DOP.max, es.money.dop);

  return (
    <section className="stack">
      <BackBar href="/" />
      <h1>{es.priceGuide.title}</h1>
      <p className="muted">{es.priceGuide.intro}</p>

      <div className="panel stack">
        <b>{es.priceGuide.diagnosticTitle}: {diagnostic}</b>
        <p className="muted">{es.priceGuide.diagnosticNote}</p>
      </div>

      {rows === null ? (
        <div className="panel">
          <p>{es.priceGuide.loadError}</p>
        </div>
      ) : (
        catalog.map((item) => {
          const trade = item.key;
          const guide = guideFor(rows, trade);
          return (
            <div className="panel stack" key={trade}>
              <h2>{item.proLabel}</h2>
              {guide ? (
                <>
                  <p>
                    <b>
                      {es.priceGuide.typical}: {formatRange(guide.low, guide.high, es.money.dop)}
                    </b>
                  </p>
                  <p className="muted">{es.priceGuide.basedOn(guide.sample)}</p>
                  <p className="muted">{es.priceGuide.finalPrice}</p>
                </>
              ) : (
                <p className="muted">{es.priceGuide.notEnough}</p>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
