import { verifiedKindsByPro } from "@/lib/data/verifiedFlags";
import Link from "next/link";
import { BackArrow } from "@/components/BackBar";
import { getProCardsByIds } from "@/lib/data/pros";
import { getProReviewSummary, type ReviewSummary } from "@/lib/data/reviews";
import { es } from "@/lib/i18n/es";
import { pageMetadata } from "@/lib/seo/metadata";
import { getTradeCatalog, getTradeMap } from "@/lib/data/trades-server";
import { proLabelOf } from "@/lib/data/trades";
import { filterPros, parseDate, parseSort, sortPros, type SortKey } from "@/lib/domain/discovery";
import { getMunicipalities } from "@/lib/data/municipalities-server";
import { TIER_LABEL, approxDistance, searchLadder, searchNationwide, type LadderRow, type LadderTier, type NationwideRow } from "@/lib/data/municipalities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listSavedProIds } from "@/lib/data/saved";
import { avatarUrl } from "@/lib/storage/proFiles";
import { ProPicker } from "./ProPicker";
import { DateField } from "@/components/home/DateField";
import { FiltersSheet } from "./FiltersSheet";
import { SortSelect } from "./SortSelect";

export const metadata = pageMetadata({ title: es.seo.searchTitle, description: es.seo.searchDescription, path: "/buscar" });
type Params = {
  /** Municipality id. Empty or absent means nationwide. */
  m?: string;
  trade?: string;
  /** Legacy market key (backward compatibility only): preselects its municipality. ?zone= is ignored. */
  city?: string;
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
  // Place (Item 12): one control. A municipality ranks by the ladder (0112); "Todo el país" lists every approved pro (0113).
  const municipalities = await getMunicipalities();
  const requestedId = params.m && municipalities.some((x) => x.id === params.m) ? params.m : null;
  // Backward compatibility: ?city=<legacy key> preselects the matching municipality when ?m is absent.
  const legacyId =
    !requestedId && params.city ? (municipalities.find((x) => x.legacyCity === params.city)?.id ?? null) : null;
  const municipalityId = requestedId ?? legacyId;
  const municipality = municipalityId ? (municipalities.find((x) => x.id === municipalityId) ?? null) : null;

  let ladderRows: LadderRow[] = [];
  let nationwideRows: NationwideRow[] = [];
  let otherTrade = false;
  if (municipalityId) {
    ladderRows = await searchLadder(supabase, { trade, municipalityId });
    if (ladderRows.length === 0 && trade) {
      // Nothing for this trade in the country: other trades nearby, under a clear heading.
      ladderRows = await searchLadder(supabase, { trade: null, municipalityId });
      otherTrade = ladderRows.length > 0;
    }
  } else {
    nationwideRows = await searchNationwide(supabase, { trade });
    if (nationwideRows.length === 0 && trade) {
      nationwideRows = await searchNationwide(supabase, { trade: null });
      otherTrade = nationwideRows.length > 0;
    }
  }
  const totalNationwide = Number(nationwideRows[0]?.total_count ?? 0);

  // Where each pro is, in result order. Tier only exists for a chosen municipality.
  type PlaceInfo = { rank: number; tier: LadderTier | null; line: string };
  const placeByPro = new Map<string, PlaceInfo>();
  if (municipalityId) {
    ladderRows.forEach((r, i) =>
      placeByPro.set(r.pro_id, {
        rank: i,
        tier: r.tier,
        line: [r.municipality_name, approxDistance(r.approx_km)].filter(Boolean).join(" · "),
      }),
    );
  } else {
    nationwideRows.forEach((r, i) =>
      placeByPro.set(r.pro_id, { rank: i, tier: null, line: `${r.municipality_name}, ${r.province}` }),
    );
  }
  const scopeCards = await getProCardsByIds(supabase, [...placeByPro.keys()]);
  const organicRaw = scopeCards.filter((c) => c.id !== userId);
  const candidates = organicRaw;
  const kinds = await verifiedKindsByPro(
    supabase,
    [...new Map(candidates.map((p) => [p.id, { id: p.id, isCompany: p.pro_type === "company" }])).values()],
  );
  const flags = { verifiedOnly, availableOnly, verifiedIds: new Set(kinds.keys()) };

  const visible = filterPros(organicRaw, flags).filter(
    (p) => matchesName(p.full_name) && (!proType || p.pro_type === proType) && notMe(p.id),
  );
  const rankOf = (id: string) => placeByPro.get(id)?.rank ?? 0;
  const tierOf = (id: string) => placeByPro.get(id)?.tier ?? 0;
  // With a municipality: tier first, then price (if chosen) or distance rank. Nationwide: sort rules only.
  const pros = municipalityId
    ? [...visible].sort(
        (a, b) =>
          tierOf(a.id) - tierOf(b.id) ||
          (sort === "precio" ? a.price_min_dop - b.price_min_dop : 0) ||
          rankOf(a.id) - rankOf(b.id),
      )
    : sortPros(visible, sort, null);
  // One small aggregate per card. Published, non-held reviews only (migration 0030).
  const summaries = new Map<string, ReviewSummary>(
    await Promise.all(
      pros.map(async (p) => [p.id, await getProReviewSummary(supabase, p.id)] as const),
    ),
  );

  const toPicker = (p: (typeof pros)[number]) => {
    const sm = summaries.get(p.id);
    const reviewLabel =
      !sm || sm.review_count === 0
        ? es.reviews.noReviews
        : `${es.reviews.average(sm.average ?? 0)} · ${
            sm.review_count === 1 ? es.reviews.countOne : es.reviews.countMany(sm.review_count)
          }`;
    const info = placeByPro.get(p.id);
    const tierLabel = otherTrade
      ? `Otros oficios${municipalityId ? " cercanos" : " en el país"} (no hay ${proLabelOf(tm, trade ?? "")} aprobado en el país)`
      : info?.tier
        ? TIER_LABEL[info.tier]
        : undefined;
    return {
      id: p.id,
      available: p.available,
      name: p.full_name,
      trade: p.trade,
      tradeLabel: proLabelOf(tm, p.trade),
      zone: info?.line ?? p.zone,
      tierLabel,
      priceLabel: `${es.search.priceRange}: ${es.money.dop(p.price_min_dop)} – ${es.money.dop(p.price_max_dop)} · ${es.priceUnit.suffix[p.price_unit]}`,
      reviewLabel,
      avatarSrc: avatarUrl(supabase, p.avatar_path),
      boosted: false,
      isCompany: p.pro_type === "company",
      verified: kinds.get(p.id) ?? null,
      companyName: p.pro_type === "company" ? p.razon_social : null,
      urgentAvailable: p.urgent_available,
    };
  };

  // Every filter link keeps the others, so changing one never clears the rest.
  const carry = (over: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    const current: Record<string, string | null> = {
      trade,
      m: municipalityId,
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
    m: municipalityId,
    q: q || null,
    type: typeParam,
    sort: sort === "recomendados" ? null : sort,
    verified: verifiedOnly ? "1" : null,
    hoy: params.hoy === "1" ? "1" : null,
    date,
  })) if (v) urlParams[k] = v;

  const filterForm = (
    <form id="search-filters" className="stack search-form" method="get" action="/buscar">
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

      {/* One place control (Municipio). Trade chips set `trade` (hidden below). */}
      <input type="hidden" name="trade" value={trade ?? ""} />
      <label className="field">
        <span>¿Dónde lo necesitas?</span>
        <select name="m" defaultValue={municipalityId ?? ""} style={{ minHeight: 44 }}>
          <option value="">Todo el país</option>
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

      <DateField
        id="buscar-date"
        name="date"
        variant="field"
        defaultValue={date ?? ""}
        label={<>{es.discover.when} <em className="muted">{es.discover.whenOptional}</em></>}
      />
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
        <FiltersSheet formId="search-filters">{filterForm}</FiltersSheet>
      </div>

      <p className="muted">{es.filters.resultsIn(pros.length, municipality?.name ?? "todo el país")}</p>
      {!municipalityId && totalNationwide > nationwideRows.length ? (
        <p className="muted">Mostrando {nationwideRows.length} de {totalNationwide}. Elige un municipio para ver más cerca de ti.</p>
      ) : null}

      {otherTrade ? (
        <p className="muted">
          No hay {proLabelOf(tm, trade ?? "")} aprobado en el país.{" "}
          {municipalityId ? "Estos profesionales de otros oficios están cerca." : "Estos profesionales de otros oficios están disponibles."}
        </p>
      ) : null}

      {pros.length === 0 ? (
        <div>
          <p className="muted">{es.search.empty}</p>
          {trade ? (
            <Link className="btn" href={`/pide-servicio?trade=${encodeURIComponent(trade)}${municipalityId ? `&m=${municipalityId}` : ""}`} style={{ minHeight: 44 }}>
              Pide este servicio
            </Link>
          ) : null}
        </div>
      ) : (
        <ProPicker
          userId={userId}
          savedIds={savedIds}
          boosted={[]}
          pros={pros.map((p) => toPicker(p))}
        />
      )}
    </section>
  );
}
