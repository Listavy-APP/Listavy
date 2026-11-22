import Link from "next/link";
import { getProCardsByIds } from "@/lib/data/pros";
import { listActiveFixedServices, listFixedServicePros } from "@/lib/data/fixed";
import { approxDistance, groupByProvince, TIER_LABEL, type Municipality } from "@/lib/data/municipalities";
import { proLabelOf, type CatalogTrade } from "@/lib/data/trades";
import type { FixedServiceRow } from "@/lib/domain/fixed-service";
import { es } from "@/lib/i18n/es";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-first discovery for /pedir?modo=fijo (no pro chosen), 0116 amendment.
 * Steps by URL: trade (oficio) → service (servicio) → place (mun) and pros. Picking a pro opens the fixed form.
 */
export async function FixedDiscovery({
  supabase,
  trades,
  municipalities,
  oficio,
  servicio,
  mun,
}: {
  supabase: SupabaseClient;
  trades: Record<string, CatalogTrade>;
  municipalities: Municipality[];
  oficio: string | null;
  servicio: string | null;
  mun: string | null;
}) {
  const all = await listActiveFixedServices(supabase);
  const tradeKeys = [...new Set(all.map((s) => s.trade))];
  const byTrade = (key: string) => all.filter((s) => s.trade === key);
  const chosenTrade = oficio && tradeKeys.includes(oficio) ? oficio : null;
  const chosen: FixedServiceRow | null = servicio ? (all.find((s) => s.id === servicio) ?? null) : null;
  const chosenMun = mun && municipalities.some((m) => m.id === mun) ? mun : null;

  const tabs = (
    <nav className="row" aria-label={es.fixed.modeQuote}>
      <Link className="button secondary" href="/pedir">{es.fixed.modeQuote}</Link>
      <Link className="button" href="/pedir?modo=fijo" aria-current="page">{es.fixed.modePrice}</Link>
    </nav>
  );

  if (all.length === 0) {
    return (
      <section className="stack">
        {tabs}
        <h1>{es.fixed.modePrice}</h1>
        <p className="muted">{es.fixed.admin.empty}</p>
      </section>
    );
  }

  if (!chosenTrade) {
    return (
      <section className="stack">
        {tabs}
        <h1>{es.fixed.pickTrade}</h1>
        <ul className="list">
          {tradeKeys.map((k) => (
            <li key={k}>
              <Link className="button secondary" href={`/pedir?modo=fijo&oficio=${k}`}>
                {proLabelOf(trades, k)} ({byTrade(k).length})
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (!chosen || chosen.trade !== chosenTrade) {
    return (
      <section className="stack">
        {tabs}
        <h1>{es.fixed.pickService}</h1>
        <Link className="back" href="/pedir?modo=fijo">{es.fixed.changeTrade}</Link>
        {byTrade(chosenTrade).map((s) => (
          <Link key={s.id} className="panel stack" href={`/pedir?modo=fijo&oficio=${chosenTrade}&servicio=${s.id}`} style={{ minHeight: 44 }}>
            <b>
              {s.name_es} · {es.money.dop(s.price_dop)}
            </b>
            <span className="muted">
              {es.fixed.includesLabel}: {s.includes_es}
            </span>
          </Link>
        ))}
      </section>
    );
  }

  // Service chosen: pros for it, ladder order. Place is the pro's real municipality.
  const rows = await listFixedServicePros(supabase, chosen.id, chosenMun);
  const cards = await getProCardsByIds(supabase, rows.map((r) => r.pro_id));
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const groups = groupByProvince(municipalities);
  const back = `/pedir?modo=fijo&oficio=${chosenTrade}`;

  return (
    <section className="stack">
      {tabs}
      <Link className="back" href={back}>{es.fixed.changeService}</Link>
      <h1>{chosen.name_es} · {es.money.dop(chosen.price_dop)}</h1>
      <p className="muted">
        {es.fixed.includesLabel}: {chosen.includes_es}
      </p>
      <p className="muted">{es.fixed.compassHint}</p>
      <form method="get" action="/pedir" className="stack">
        <input type="hidden" name="modo" value="fijo" />
        <input type="hidden" name="oficio" value={chosenTrade} />
        <input type="hidden" name="servicio" value={chosen.id} />
        <label className="field">
          <span>{es.fixed.placeLabel}</span>
          <select name="mun" defaultValue={chosenMun ?? ""} style={{ minHeight: 44 }}>
            <option value="">{es.fixed.placeAny}</option>
            {[...groups.entries()].map(([prov, list]) => (
              <optgroup key={prov} label={prov}>
                {list.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button className="button secondary" type="submit">{es.fixed.placeApply}</button>
      </form>

      {rows.length === 0 ? (
        <p className="muted">{es.fixed.noProsForService}</p>
      ) : (
        <ul className="list">
          {rows.map((r) => {
            const c = cardById.get(r.pro_id);
            if (!c) return null;
            const km = approxDistance(r.approx_km);
            return (
              <li key={r.pro_id} className="panel stack">
                <b>{c.full_name ?? "—"}</b>
                <span className="muted">
                  {TIER_LABEL[r.tier]} · {r.municipality_name}, {r.province}
                  {km ? ` · ${km}` : ""}
                </span>
                <Link className="button" href={`/pedir?pro=${r.pro_id}&modo=fijo&servicio=${chosen.id}`}>
                  {es.fixed.chooseThisPro}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
