import Link from "next/link";
import { listProCards } from "@/lib/data/pros";
import { getProReviewSummary, type ReviewSummary } from "@/lib/data/reviews";
import { es } from "@/lib/i18n/es";
import { SD_ZONES, TRADES, isTrade, isZone } from "@/lib/domain/catalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { avatarUrl } from "@/lib/storage/proFiles";
import { Avatar } from "@/components/Avatar";

export const metadata = { title: es.search.title };
// Session-dependent page: block on the server so redirects return real status codes.
export const instant = false;


export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ trade?: string; zone?: string }>;
}) {
  const params = await searchParams;
  const trade = params.trade && isTrade(params.trade) ? params.trade : null;
  const zone = params.zone && isZone(params.zone) ? params.zone : null;

  // Anonymous visitors can browse. list_pro_cards returns only safe columns.
  const supabase = await createSupabaseServerClient();
  const pros = await listProCards(supabase, { trade, zone });
  // One small aggregate per card. Published, non-held reviews only (migration 0030).
  const summaries = new Map<string, ReviewSummary>(
    await Promise.all(
      pros.map(async (p) => [p.id, await getProReviewSummary(supabase, p.id)] as const),
    ),
  );

  // Trade chips keep the chosen zone, so changing the trade never clears it.
  const chipHref = (t: string | null) => {
    const q = new URLSearchParams();
    if (t) q.set("trade", t);
    if (zone) q.set("zone", zone);
    const qs = q.toString();
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

      <form className="stack" method="get" action="/buscar">
        {/* Trade is chosen with the chips above; keep it in the query when searching. */}
        <input type="hidden" name="trade" value={trade ?? ""} />
        <label className="field">
          <span>{es.search.zone}</span>
          <select name="zone" defaultValue={zone ?? ""}>
            <option value="">{es.search.all}</option>
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
        <ul className="cards">
          {pros.map((p) => (
            <li key={p.id} className="card">
              <div className="card-head">
                <Avatar name={p.full_name} src={avatarUrl(supabase, p.avatar_path)} />
                <div className="card-body">
                  <p className="card-name">{p.full_name ?? "—"}</p>
                  <p className="muted">
                    {es.trades[p.trade]} · {p.zone}
                  </p>
                </div>
              </div>
              <div className="badge">{es.search.verified}</div>
              <p className="card-price">
                {es.search.priceRange}: {es.money.dop(p.price_min_dop)} – {es.money.dop(p.price_max_dop)}
              </p>
              <p className="muted">
                {(() => {
                  const sm = summaries.get(p.id);
                  if (!sm || sm.review_count === 0) return es.reviews.noReviews;
                  const count = sm.review_count === 1 ? es.reviews.countOne : es.reviews.countMany(sm.review_count);
                  return `${es.reviews.average(sm.average ?? 0)} · ${count}`;
                })()}
              </p>
              <Link className="button secondary" href={`/pro/${p.id}`}>
                {es.search.viewProfile}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
