import Link from "next/link";
import { getProCardsByIds, listBoostedProIds, listProCards } from "@/lib/data/pros";
import { getProReviewSummary, type ReviewSummary } from "@/lib/data/reviews";
import { es } from "@/lib/i18n/es";
import { SD_ZONES, TRADES, isTrade, isZone } from "@/lib/domain/catalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { avatarUrl } from "@/lib/storage/proFiles";
import { ProPicker } from "./ProPicker";

export const metadata = { title: es.search.title };
// Session-dependent page: block on the server so redirects return real status codes.
export const instant = false;


export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ trade?: string; zone?: string; q?: string }>;
}) {
  const params = await searchParams;
  const trade = params.trade && isTrade(params.trade) ? params.trade : null;
  const zone = params.zone && isZone(params.zone) ? params.zone : null;
  // Name search, case-insensitive. Capped so a long query cannot be used to probe the list.
  const q = (params.q ?? "").trim().slice(0, 80);
  const matchesName = (name: string | null) =>
    !q || (name ?? "").toLocaleLowerCase("es").includes(q.toLocaleLowerCase("es"));

  // Anonymous visitors can browse. list_pro_cards returns only safe columns.
  const supabase = await createSupabaseServerClient();
  const organicAll = (await listProCards(supabase, { trade, zone })).filter((p) => matchesName(p.full_name));
  // Paid boosts: up to 3 ids, newest boost first, filtered the same way (migration 0036).
  // Cards are fetched by id so the listProCards row limit cannot hide a boosted pro.
  const boostedIds = await listBoostedProIds(supabase, { trade, zone });
  const boostedPros = (await getProCardsByIds(supabase, boostedIds)).filter((p) => matchesName(p.full_name));
  const boostedSet = new Set(boostedPros.map((p) => p.id));
  const organicPros = organicAll.filter((p) => !boostedSet.has(p.id));
  const pros = [...boostedPros, ...organicPros];
  // One small aggregate per card. Published, non-held reviews only (migration 0030).
  const summaries = new Map<string, ReviewSummary>(
    await Promise.all(
      pros.map(async (p) => [p.id, await getProReviewSummary(supabase, p.id)] as const),
    ),
  );

  const toPicker = (p: (typeof pros)[number], boosted: boolean) => {
    const sm = summaries.get(p.id);
    const reviewLabel =
      !sm || sm.review_count === 0
        ? es.reviews.noReviews
        : `${es.reviews.average(sm.average ?? 0)} · ${
            sm.review_count === 1 ? es.reviews.countOne : es.reviews.countMany(sm.review_count)
          }`;
    return {
      id: p.id,
      name: p.full_name,
      trade: p.trade,
      tradeLabel: es.trades[p.trade],
      zone: p.zone,
      priceLabel: `${es.search.priceRange}: ${es.money.dop(p.price_min_dop)} – ${es.money.dop(p.price_max_dop)}`,
      reviewLabel,
      avatarSrc: avatarUrl(supabase, p.avatar_path),
      boosted,
    };
  };

  // Chips and the form keep the other filters, so changing one never clears the rest.
  const chipHref = (t: string | null) => {
    const sp = new URLSearchParams();
    if (t) sp.set("trade", t);
    if (zone) sp.set("zone", zone);
    if (q) sp.set("q", q);
    const qs = sp.toString();
    return qs ? `/buscar?${qs}` : "/buscar";
  };

  return (
    <section className="stack">
      <div className="backbar">
        <Link className="back" href="/" aria-label={es.common.back}>
          ‹
        </Link>
        <span className="bt">{es.search.title}</span>
      </div>

      <form className="stack search-form" method="get" action="/buscar">
        <label className="field">
          <span>{es.search.nameLabel}</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={es.search.namePlaceholder}
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>

        {/* Trade and zone are two separate filters. Trade chips set `trade` (hidden below). */}
        <input type="hidden" name="trade" value={trade ?? ""} />
        <div className="filter-group" role="group" aria-label={es.search.trade}>
          <span className="filter-label">{es.search.trade}</span>
          <div className="chip-row">
            <Link className={`chip${trade === null ? " on" : ""}`} href={chipHref(null)}>
              {es.search.all}
            </Link>
            {TRADES.map((t) => (
              <Link key={t} className={`chip${trade === t ? " on" : ""}`} href={chipHref(t)}>
                {es.trades[t]}
              </Link>
            ))}
          </div>
        </div>

        <label className="field">
          <span>{es.search.zone}</span>
          <select name="zone" defaultValue={zone ?? ""}>
            <option value="">{es.search.allZones}</option>
            {SD_ZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <button className="button" type="submit">
          {es.search.submit}
        </button>
      </form>

      <p className="muted">{es.search.results(pros.length)}</p>

      {pros.length === 0 ? (
        <p className="muted">{es.search.empty}</p>
      ) : (
        <ProPicker
          boosted={boostedPros.map((p) => toPicker(p, true))}
          pros={organicPros.map((p) => toPicker(p, false))}
        />
      )}
    </section>
  );
}
