import Link from "next/link";
import { listProCards } from "@/lib/data/pros";
import { es } from "@/lib/i18n/es";
import { SD_ZONES, TRADES, isTrade, isZone } from "@/lib/domain/catalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { avatarUrl } from "@/lib/storage/proFiles";
import { ProAvatar } from "@/components/ProAvatar";

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

  return (
    <section className="stack">
      <div className="backbar">
        <Link className="back" href="/" aria-label={es.common.back}>
          ‹
        </Link>
        <span className="bt">{es.search.title}</span>
      </div>

      <div className="chip-row">
        <Link className={`chip${trade === null ? " on" : ""}`} href="/buscar">
          {es.search.all}
        </Link>
        {TRADES.map((t) => (
          <Link key={t} className={`chip${trade === t ? " on" : ""}`} href={`/buscar?trade=${t}`}>
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
                <ProAvatar name={p.full_name} src={avatarUrl(supabase, p.avatar_path)} />
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
