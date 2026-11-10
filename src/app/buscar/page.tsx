import Link from "next/link";
import { listProCards } from "@/lib/data/pros";
import { es } from "@/lib/i18n/es";
import { SD_ZONES, TRADES, isTrade, isZone } from "@/lib/domain/catalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.search.title };
// Session-dependent page: block on the server so redirects return real status codes.
export const instant = false;

// Visual only: two-letter monogram from the first two words of the name.
function initials(name: string | null): string {
  if (!name) return "?";
  const words = name.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
}

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

  return (
    <section className="stack">
      <h1>{es.search.title}</h1>

      <form className="stack" method="get" action="/buscar">
        <label className="field">
          <span>{es.search.trade}</span>
          <select name="trade" defaultValue={trade ?? ""}>
            <option value="">{es.search.all}</option>
            {TRADES.map((t) => (
              <option key={t} value={t}>
                {es.trades[t]}
              </option>
            ))}
          </select>
        </label>
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
                <div className="avatar" aria-hidden="true">
                  {initials(p.full_name)}
                </div>
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
              <p className="muted">{es.search.noReviews}</p>
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
