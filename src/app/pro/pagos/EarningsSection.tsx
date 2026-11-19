import Link from "next/link";
import { barPercent } from "@/lib/domain/pro-tools";
import type { EarningsSummary, PerformanceSummary } from "@/lib/data/pro-tools";
import { es } from "@/lib/i18n/es";

const money = (n: number) => `RD$${Math.round(n).toLocaleString("es-DO")}`;

/** Earnings cards, 6-month bars and 90-day performance. Read-only. Server-rendered, no chart library. */
export function EarningsSection({
  earnings,
  performance,
}: {
  earnings: EarningsSummary | null;
  performance: PerformanceSummary | null;
}) {
  if (!earnings && !performance) {
    return <p className="error" role="alert">{es.proEarnings.unavailable}</p>;
  }

  const monthly = earnings?.monthly ?? [];
  const maxMonth = Math.max(0, ...monthly.map((m) => m.amount));
  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-DO", { month: "short", timeZone: "UTC" });
  };

  return (
    <section className="stack earnings" aria-label={es.proEarnings.title}>
      <div className="earnings-head">
        <h2>{es.proEarnings.title}</h2>
        <Link className="button secondary tap" href="/pro/pagos/estado-anual">
          {es.proEarnings.statement}
        </Link>
      </div>

      {earnings ? (
        <>
          <div className="earnings-cards">
            <div className="earnings-card">
              <span className="muted">{es.proEarnings.thisMonth}</span>
              <strong>{money(earnings.this_month)}</strong>
            </div>
            <div className="earnings-card">
              <span className="muted">{es.proEarnings.lastMonth}</span>
              <strong>{money(earnings.last_month)}</strong>
            </div>
            <div className="earnings-card">
              <span className="muted">{es.proEarnings.allTime}</span>
              <strong>{money(earnings.all_time)}</strong>
            </div>
          </div>
          <p className="muted">
            {es.proEarnings.pending}: <strong>{money(earnings.pending)}</strong>
          </p>

          <div className="stack">
            <h3>{es.proEarnings.monthlyTitle}</h3>
            <div className="earnings-bars" role="img" aria-label={es.proEarnings.monthlyTitle}>
              {monthly.map((m) => (
                <div key={m.month} className="earnings-bar-col">
                  <span className="earnings-bar-value">{m.amount > 0 ? money(m.amount) : ""}</span>
                  <div className="earnings-bar-track">
                    <div className="earnings-bar" style={{ height: `${Math.max(barPercent(m.amount, maxMonth), m.amount > 0 ? 4 : 0)}%` }} />
                  </div>
                  <span className="earnings-bar-label">{monthLabel(m.month)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {performance ? (
        <div className="stack">
          <h3>{es.proEarnings.perfTitle}</h3>
          <dl className="perf-grid">
            <div>
              <dt className="muted">{es.proEarnings.submitted}</dt>
              <dd>{performance.submitted}</dd>
            </div>
            <div>
              <dt className="muted">{es.proEarnings.accepted}</dt>
              <dd>{performance.accepted}</dd>
            </div>
            <div>
              <dt className="muted">{es.proEarnings.acceptance}</dt>
              <dd>{performance.acceptance_rate === null ? es.proEarnings.noData : `${performance.acceptance_rate}%`}</dd>
            </div>
            <div>
              <dt className="muted">{es.proEarnings.response}</dt>
              <dd>{performance.avg_response_hours === null ? es.proEarnings.noData : es.proEarnings.hours(performance.avg_response_hours)}</dd>
            </div>
          </dl>
          <div className="stack">
            <strong>{es.proEarnings.rating}</strong>
            {performance.review_count > 0 && performance.rating_average !== null ? (
              <p className="muted">
                {performance.rating_average.toLocaleString("es-DO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · {es.proEarnings.reviews(performance.review_count)}
              </p>
            ) : (
              <p className="muted">{es.proEarnings.noRating}</p>
            )}
            <p className="muted">{es.proEarnings.ratingNote}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
