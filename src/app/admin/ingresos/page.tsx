import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { getCurrentProfile } from "@/lib/data/profiles";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.admin.revenue.title };

// Session-dependent page: read at request time, never cached.
export const instant = false;

const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

type Day = { day: string; gmv_dop: number; commission_dop: number; paid_jobs: number; requests: number };
type RevenueSummary = {
  days: Period;
  gmv_dop: number;
  commission_dop: number;
  funnel: { requests: number; quoted: number; paid: number; completed: number };
  series: Day[];
};

function dop(amount: number): string {
  return `RD$${Math.round(amount).toLocaleString("es-DO")}`;
}

function parsePeriod(raw: string | undefined): Period {
  const n = Number(raw);
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 30;
}

function percentOf(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

function periodLabel(p: Period): string {
  if (p === 7) return es.admin.revenue.days7;
  if (p === 90) return es.admin.revenue.days90;
  return es.admin.revenue.days30;
}

export default async function AdminRevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  await connection();
  const { dias } = await searchParams;
  const period = parsePeriod(dias);

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const { data, error } = await supabase.rpc("admin_revenue_summary", { p_days: period });
  const summary = error ? null : (data as unknown as RevenueSummary);
  const series = summary?.series ?? [];
  const maxGmv = Math.max(1, ...series.map((d) => d.gmv_dop));

  return (
    <div className="stack">
      <BackBar href="/admin" label={es.admin.revenue.title} />
      <h1>{es.admin.revenue.title}</h1>

      <nav className="tabs" aria-label={es.admin.revenue.period}>
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/admin/ingresos?dias=${p}`}
            className={p === period ? "tab active" : "tab"}
            aria-current={p === period ? "page" : undefined}
          >
            {periodLabel(p)}
          </Link>
        ))}
      </nav>

      {error || !summary ? (
        <p className="muted">{es.admin.revenue.loadError}</p>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat">
              <span className="stat-label">{es.admin.revenue.gmv}</span>
              <span className="stat-value">{dop(summary.gmv_dop)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">{es.admin.revenue.commission}</span>
              <span className="stat-value">{dop(summary.commission_dop)}</span>
            </div>
          </div>

          <section className="panel stack" aria-labelledby="revenue-funnel">
            <h2 id="revenue-funnel">{es.admin.revenue.funnel}</h2>
            <ol className="stack">
              <li>
                {es.admin.revenue.funnelRequests}: {summary.funnel.requests}
              </li>
              <li>
                {es.admin.revenue.funnelQuoted}: {summary.funnel.quoted}{" "}
                <span className="muted">({percentOf(summary.funnel.quoted, summary.funnel.requests)})</span>
              </li>
              <li>
                {es.admin.revenue.funnelPaid}: {summary.funnel.paid}{" "}
                <span className="muted">({percentOf(summary.funnel.paid, summary.funnel.requests)})</span>
              </li>
              <li>
                {es.admin.revenue.funnelCompleted}: {summary.funnel.completed}{" "}
                <span className="muted">({percentOf(summary.funnel.completed, summary.funnel.requests)})</span>
              </li>
            </ol>
          </section>

          <section className="panel stack" aria-labelledby="revenue-series">
            <h2 id="revenue-series">{es.admin.revenue.series}</h2>
            {summary.gmv_dop === 0 && summary.funnel.requests === 0 ? (
              <p className="muted">{es.admin.revenue.noData}</p>
            ) : (
              <ul className="stack revenue-series">
                {series.map((d) => (
                  <li key={d.day} className="revenue-row">
                    <span className="revenue-day">{d.day.slice(5)}</span>
                    <span className="revenue-bar" aria-hidden="true">
                      <span style={{ width: `${(d.gmv_dop / maxGmv) * 100}%` }} />
                    </span>
                    <span className="revenue-value">
                      {dop(d.gmv_dop)} · {d.requests} sol.
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="muted">{es.admin.revenue.note}</p>
        </>
      )}
    </div>
  );
}
