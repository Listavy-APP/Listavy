import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { ViewAsButton } from "@/components/ViewAsButton";
import { getCurrentProfile } from "@/lib/data/profiles";
import { CITIES } from "@/lib/domain/catalog";
import { getTradeCatalog, getTradeMap } from "@/lib/data/trades-server";
import { proLabelOf } from "@/lib/data/trades";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.adminPros.title };

// Session-dependent page: read at request time, never cached.
export const instant = false;

type ApprovedPro = {
  id: string;
  full_name: string | null;
  trade: string;
  zone: string;
  city: string;
  plan: string;
  available: boolean;
  is_demo: boolean;
};

export default async function AdminApprovedProsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; trade?: string }>;
}) {
  await connection();
  const { q = "", city = "", trade = "" } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const cityFilter = (CITIES as readonly string[]).includes(city) ? city : null;
  const catalog = await getTradeCatalog();
  const tm = await getTradeMap();
  const tradeFilter = catalog.some((t) => t.key === trade) ? trade : null;

  // admin_list_approved_pros() is SECURITY DEFINER and checks is_admin() (AAL2). Read-only, list columns only.
  const { data, error } = await supabase.rpc("admin_list_approved_pros", {
    p_search: q.trim() || null,
    p_city: cityFilter,
    p_trade: tradeFilter,
  });
  if (error) throw new Error(`No se pudieron leer los profesionales: ${error.message}`);
  const pros = (data ?? []) as unknown as ApprovedPro[];

  return (
    <section className="stack">
      <BackBar href="/admin" />
      <h1>{es.adminPros.title}</h1>
      <p className="muted">{es.adminPros.help}</p>

      <form className="admin-search" action="/admin/profesionales" method="get">
        <label className="field">
          {es.adminPros.searchLabel}
          <input type="search" name="q" defaultValue={q} />
        </label>
        <label className="field">
          {es.adminPros.cityLabel}
          <select name="city" defaultValue={cityFilter ?? ""}>
            <option value="">{es.adminPros.allCities}</option>
            {CITIES.map((c) => (
              <option key={c} value={c}>{es.cities[c]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          {es.adminPros.tradeLabel}
          <select name="trade" defaultValue={tradeFilter ?? ""}>
            <option value="">{es.adminPros.allTrades}</option>
            {catalog.map((t) => (
              <option key={t.key} value={t.key}>{t.proLabel}</option>
            ))}
          </select>
        </label>
        <button className="button secondary" type="submit">{es.adminPros.applyFilters}</button>
      </form>

      {pros.length === 0 ? <p className="muted">{es.adminPros.empty}</p> : null}
      {pros.map((p) => (
        <article key={p.id} className="card stack">
          <h2>{p.full_name ?? es.adminPros.noName}</h2>
          <dl className="stack">
            <div><dt className="muted">{proLabelOf(tm, p.trade)}</dt><dd>{p.zone}, {es.cities[p.city as keyof typeof es.cities] ?? p.city}</dd></div>
            <div><dt className="muted">{es.adminPros.plan}</dt><dd>{p.plan === "pro" ? es.adminPros.planPro : es.adminPros.planFree}</dd></div>
            <div><dt className="muted">{es.adminPros.available}</dt><dd>{p.available ? es.adminPros.availableYes : es.adminPros.availableNo}</dd></div>
          </dl>
          {p.is_demo ? <span className="badge">{es.adminPros.demo}</span> : null}
          <p><Link href={`/pro/${p.id}`}>{es.adminPros.viewProfile}</Link></p>
          {profile.admin_role === "super_admin" ? <ViewAsButton userId={p.id} /> : null}
        </article>
      ))}
      {pros.length >= 200 ? <p className="muted">{es.adminPros.limitNote}</p> : null}
    </section>
  );
}
