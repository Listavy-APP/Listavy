import { verifiedKindsByPro } from "@/lib/data/verifiedFlags";
import Link from "next/link";
import { BackArrow } from "@/components/BackBar";
import { getProCardsByIds, listBoostedProIds, listProCards } from "@/lib/data/pros";
import { getProReviewSummary, type ReviewSummary } from "@/lib/data/reviews";
import { es } from "@/lib/i18n/es";
import { pageMetadata } from "@/lib/seo/metadata";
import { DEFAULT_CITY, cityOfZone, isCity, isZone, type City } from "@/lib/domain/catalog";
import { getTradeCatalog, getTradeMap } from "@/lib/data/trades-server";
import { proLabelOf } from "@/lib/data/trades";
import { filterPros, parseDate, parseSort, sortPros, type SortKey } from "@/lib/domain/discovery";
import { CityZoneSelect } from "@/components/CityZoneSelect";
import { getMunicipalities } from "@/lib/data/municipalities-server";
import { TIER_LABEL, approxDistance, searchLadder, type LadderRow } from "@/lib/data/municipalities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listSavedProIds } from "@/lib/data/saved";
import { avatarUrl } from "@/lib/storage/proFiles";
import { ProPicker } from "./ProPicker";
import { FiltersSheet } from "./FiltersSheet";
import { SortSelect } from "./SortSelect";

export const metadata = pageMetadata({ title: es.seo.searchTitle, description: es.seo.searchDescription, path: "/buscar" });
type Params = {
  /** Municipality id (0112). When set, results come from the search ladder. */
  m?: string;
  trade?: string;
  city?: string;
  zone?: string;
  q?: string;
  type?: string;
  sort?: string;
  verified?: string;
  hoy?: string;
  date?: string;
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const catalog = await getTradeCatalog();
  const tm = await getTradeMap();
  const trade = params.trade && catalog.some((t) => t.key === params.trade) ? params.trade : null;
  const zone = params.zone && isZone(params.zone) ? params.zone : null;
  // A chosen zone decides the city. Otherwise the city param, default Santo Domingo.
  const city: City = zone
    ? (cityOfZone(zone) ?? DEFAULT_CITY)
    : params.city && isCity(params.city)
      ? params.city
      : DEFAULT_CITY;
  // Person / company filter. Unknown values mean "all".
  const typeParam = params.type === "personas" || params.type === "empresas" ? params.type : null;
  const proType = typeParam === "personas" ? "individual" : typeParam === "empresas" ? "company" : null;
  // Name search, case-insensitive. Capped so a long query cannot be used to probe the list.
  const q = (params.q ?? "").trim().slice(0, 80);
  const matchesName = (name: string | null) =>
    !q || (name ?? "").toLocaleLowerCase("es").includes(q.toLocaleLowerCase("es"));
  // Sort and availability/verification filters. "Mejor valorados" is not a key, so it cannot be requested.
  const sort: SortKey = parseSort(params.sort);
  const verifiedOnly = params.verified === "1";
  const date = parseDate(params.date);
  // "¿Cuándo?" and "Disponible hoy" both mean the pro's availability boolean (no calendar exists).
  const availableOnly = params.hoy === "1" || date !== null;

  // Anonymous visitors can browse. list_pro_cards returns only safe columns.
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  const savedIds = userId ? await listSavedProIds(supabase, userId) : [];
  // A pro does not see their own card. The self-hire guard (0065) refuses it at request time too.
  const notMe = (id: string) => id !== userId;
  // Candidates first, so one call decides the icon and the "Solo verificados" filter for the same set.
  // Ladder mode (0112): a chosen municipality ranks pros by place. Legacy city lists are not used.
  const municipalities = await getMunicipalities();
  const municipalityId = params.m && municipalities.some((x) => x.id === params.m) ? params.m : null;
  let ladderRows: LadderRow[] = [];
  let ladderOtherTrade = false;
  if (municipalityId) {
    ladderRows = await searchLadder(supabase, { trade, municipalityId });
    if (ladderRows.length === 0 && trade) {
      // Nothing for this trade in the country: show other trades nearby under a clear heading.
      ladderRows = await searchLadder(supabase, { trade: null, municipalityId });
      ladderOtherTrade = ladderRows.length > 0;
    }
  }
  const ladderCards = municipalityId
    ? await getProCardsByIds(supabase, [...new Set(ladderRows.map((r) => r.pro_id))])
    : [];
  const ladderMode = municipalityId !== null;
  const organicRaw = ladderMode
    ? ladderCards.filter((c) => c.id !== userId)
    : await listProCards(supabase, { trade, zone, city, proType });
  // Paid boosts: up to 3 ids, newest boost first (migration 0036). Fetched by id so the row limit cannot hide them.
  const boostedIds = ladderMode ? [] : await listBoostedProIds(supabase, { trade, zone, city });
  const boostedRaw = await getProCardsByIds(supabase, boostedIds);
  const candidates = [...organicRaw, ...boostedRaw];
  const kinds = await verifiedKindsByPro(
    supabase,
    [...new Map(candidates.map((p) => [p.id, { id: p.id, isCompany: p.pro_type === "company" }])).values()],
  );
  const flags = { verifiedOnly, availableOnly, verifiedIds: new Set(kinds.keys()) };
  const ladderIndex = new Map(ladderRows.map((r, i) => [r.pro_id, i] as const));
  const organicAll = ladderMode
    ? filterPros(organicRaw, flags)
        .filter((p) => matchesName(p.full_name) && notMe(p.id))
        .sort((a, b) => (ladderIndex.get(a.id) ?? 0) - (ladderIndex.get(b.id) ?? 0))
    : sortPros(
        filterPros(organicRaw, flags).filter((p) => matchesName(p.full_name) && notMe(p.id)),
        sort,
        zone,
      );
  const boostedPros = filterPros(boostedRaw, flags).filter(
    (p) => matchesName(p.full_name) && (!proType || p.pro_type === proType) && notMe(p.id),
  );
  const boostedSet = new Set(boostedPros.map((p) => p.id));
  const organicPros = organicAll.filter((p) => !boostedSet.has(p.id));
  const pros = [...boostedPros, ...organicPros];
  // One small aggregate per card. Published, non-held reviews only (migration 0030).
  const summaries = new Map<string, ReviewSummary>(
    await Promise.all(
      pros.map(async (p) => [p.id, await getProReviewSummary(supabase, p.id)] as const),
    ),
  );

  const ladderRow = (id: string) => ladderRows.find((r) => r.pro_id === id);
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
      available: p.available,
      name: p.full_name,
      trade: p.trade,
      tradeLabel: proLabelOf(tm, p.trade),
      zone: ladderMode && ladderRow(p.id) ? placeLine(ladderRow(p.id)!) : p.zone,
      tierLabel: ladderMode && ladderRow(p.id) ? (ladderOtherTrade ? `Otros oficios cercanos (no hay ${proLabelOf(tm, trade ?? "")} aprobado en el país)` : TIER_LABEL[ladderRow(p.id)!.tier]) : undefined,
      priceLabel: `${es.search.priceRange}: ${es.money.dop(p.price_min_dop)} – ${es.money.dop(p.price_max_dop)}`,
      reviewLabel,
      avatarSrc: avatarUrl(supabase, p.avatar_path),
      boosted,
      isCompany: p.pro_type === "company",
      verified: kinds.get(p.id) ?? null,
      companyName: p.pro_type === "company" ? p.razon_social : null,
    };
  };

  const placeLine = (r: LadderRow) => [r.municipality_name, approxDistance(r.approx_km)].filter(Boolean).join(" · ");

  // Every filter link keeps the others, so changing one never clears the rest.
  const carry = (over: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    const current: Record<string, string | null> = {
      trade,
      zone,
      city: zone || city === DEFAULT_CITY ? null : city,
      q: q || null,
      type: typeParam,
      sort: sort === "recomendados" ? null : sort,
      verified: verifiedOnly ? "1" : null,
      hoy: params.hoy === "1" ? "1" : null,
      date,
    };
    for (const [k, v] of Object.entries({ ...current, ...over })) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `/buscar?${qs}` : "/buscar";
  };
  // Current params as a plain object, for the sort select (only URL-visible values).
  const urlParams: Record<string, string> = {};
  for (const [k, v] of Object.entries({
    trade,
    zone,
    city: zone || city === DEFAULT_CITY ? null : city,
    q: q || null,
    type: typeParam,
    sort: sort === "recomendados" ? null : sort,
    verified: verifiedOnly ? "1" : null,
    hoy: params.hoy === "1" ? "1" : null,
    date,
  })) if (v) urlParams[k] = v;

  const filterForm = (
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

      {/* Trade and zone are separate filters. Trade chips set `trade` (hidden below). */}
      <input type="hidden" name="trade" value={trade ?? ""} />
      <label className="field">
        <span>Municipio</span>
        <select name="m" defaultValue={municipalityId ?? ""} style={{ minHeight: 44 }}>
          <option value="">Todo el país (ciudades)</option>
          {[...new Set(municipalities.map((x) => x.province))].map((prov) => (
            <optgroup key={prov} label={prov}>
              {municipalities.filter((x) => x.province === prov).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <input type="hidden" name="type" value={typeParam ?? ""} />
      <input type="hidden" name="sort" value={sort === "recomendados" ? "" : sort} />
      {/* The two toggle chips are links, so the form must carry them or a submit drops them. */}
      {verifiedOnly ? <input type="hidden" name="verified" value="1" /> : null}
      {params.hoy === "1" ? <input type="hidden" name="hoy" value="1" /> : null}
      <div className="filter-group" role="group" aria-label={es.typeRouting.filterLabel}>
        <span className="filter-label">{es.typeRouting.filterLabel}</span>
        <div className="chip-row">
          <Link className={`chip${typeParam === null ? " on" : ""}`} href={carry({ type: null })}>{es.typeRouting.filterAll}</Link>
          <Link className={`chip${typeParam === "personas" ? " on" : ""}`} href={carry({ type: "personas" })}>{es.typeRouting.filterPersons}</Link>
          <Link className={`chip${typeParam === "empresas" ? " on" : ""}`} href={carry({ type: "empresas" })}>{es.typeRouting.filterCompanies}</Link>
        </div>
      </div>
      <div className="filter-group" role="group" aria-label={es.search.trade}>
        <span className="filter-label">{es.search.trade}</span>
        <div className="chip-row">
          <Link className={`chip${trade === null ? " on" : ""}`} href={carry({ trade: null })}>
            {es.search.all}
          </Link>
          {catalog.map((t) => (
            <Link key={t.key} className={`chip${trade === t.key ? " on" : ""}`} href={carry({ trade: t.key })}>
              {t.proLabel}
            </Link>
          ))}
        </div>
      </div>
      <div className="filter-group" role="group" aria-label={es.filters.open}>
        <div className="chip-row">
          <Link className={`chip${verifiedOnly ? " on" : ""}`} href={carry({ verified: verifiedOnly ? null : "1" })}>
            {es.filters.verifiedOnly}
          </Link>
          <Link className={`chip${availableOnly && date === null ? " on" : ""}`} href={carry({ hoy: params.hoy === "1" ? null : "1" })}>
            {es.filters.availableToday}
          </Link>
        </div>
      </div>

      <CityZoneSelect
        cityName="city"
        zoneName="zone"
        zoneLabel={es.search.zone}
        defaultCity={city}
        defaultZone={zone ?? undefined}
        allZonesLabel={es.search.allZones}
      />
      <label className="field">
        <span>{es.discover.when} <em className="muted">{es.discover.whenOptional}</em></span>
        <input type="date" name="date" defaultValue={date ?? ""} />
      </label>
      <button className="button" type="submit">
        {es.search.submit}
      </button>
    </form>
  );

  return (
    <section className="stack">
      <div className="backbar">
        <Link className="back" href="/" aria-label={es.common.back}><BackArrow /></Link>
        <span className="bt">{es.search.title}</span>
      </div>

      {/* Sticky top bar: sort and the filters sheet. */}
      <div className="search-topbar">
        <SortSelect current={sort} params={urlParams} />
        <FiltersSheet>{filterForm}</FiltersSheet>
      </div>

      <p className="muted">{es.filters.resultsIn(pros.length, es.cities[city])}</p>

      {ladderMode && ladderOtherTrade ? (
        <p className="muted">No hay {proLabelOf(tm, trade ?? "")} aprobado en el país. Estos profesionales de otros oficios están cerca.</p>
      ) : null}

      {pros.length === 0 ? (
        <div>
          <p className="muted">{es.search.empty}</p>
          {ladderMode && trade ? (
            <Link className="btn" href={`/pide-servicio?trade=${encodeURIComponent(trade)}&m=${municipalityId}`} style={{ minHeight: 44 }}>
              Pide este servicio
            </Link>
          ) : null}
        </div>
      ) : (
        <ProPicker
          userId={userId}
          savedIds={savedIds}
          boosted={boostedPros.map((p) => toPicker(p, true))}
          pros={organicPros.map((p) => toPicker(p, false))}
        />
      )}
    </section>
  );
}
