import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { getCurrentProfile } from "@/lib/data/profiles";
import { getAnnualStatement, getStatementYears } from "@/lib/data/pro-tools";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PrintButton } from "./PrintButton";

export const metadata = { title: es.proStatement.title };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

const money = (n: number) => `RD$${Math.round(n).toLocaleString("es-DO")}`;

/**
 * Records summary for one calendar year. Released payments only; pending is shown apart.
 * This is not a fiscal document. No NCF or DGII fields (gated separately).
 */
export default async function AnnualStatementPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  await connection();
  const { anio } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/pro/pagos/estado-anual");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "pro") redirect("/cuenta");

  const years = await getStatementYears(supabase);
  const requested = Number(anio);
  const year = years.includes(requested) ? requested : (years[0] ?? null);
  const statement = year === null ? null : await getAnnualStatement(supabase, year);

  return (
    <section className="stack">
      <div className="no-print">
        <BackBar href="/pro/pagos" />
      </div>
      <h1 className="page-title no-print">{es.proStatement.title}</h1>

      {years.length === 0 ? (
        <p className="muted no-print">{es.proStatement.noYears}</p>
      ) : (
        <>
          <form className="year-form no-print" method="get" action="/pro/pagos/estado-anual">
            <label className="field">
              <span>{es.proStatement.yearLabel}</span>
              <select name="anio" defaultValue={String(year)}>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <button className="button secondary tap" type="submit">{es.proStatement.show}</button>
          </form>

          {!statement ? (
            <p className="error" role="alert">{es.proStatement.unavailable}</p>
          ) : (
            <article className="statement print-area stack">
              <header className="stack">
                <h1 className="print-title">{es.proStatement.title} {statement.year}</h1>
                <p className="statement-disclaimer">{es.proStatement.disclaimer}</p>
                <p className="muted">{profile.full_name ?? ""}</p>
              </header>

              <section className="stack">
                <h2>{es.proStatement.totals}</h2>
                <dl className="statement-totals">
                  <div><dt>{es.proStatement.gross}</dt><dd>{money(statement.totals.gross)}</dd></div>
                  <div><dt>{es.proStatement.commission}</dt><dd>−{money(statement.totals.commission)}</dd></div>
                  <div><dt>{es.proStatement.tips}</dt><dd>{money(statement.totals.tips)}</dd></div>
                  <div><dt>{es.proStatement.fees}</dt><dd>{money(statement.totals.fees)}</dd></div>
                  <div className="statement-net"><dt>{es.proStatement.net}</dt><dd>{money(statement.totals.net)}</dd></div>
                </dl>
                <p className="muted">
                  {es.proStatement.pending}: <strong>{money(statement.pending)}</strong>
                </p>
              </section>

              <section className="stack">
                <h2>{es.proStatement.detail}</h2>
                {statement.lines.length === 0 ? (
                  <p className="muted">{es.proStatement.empty}</p>
                ) : (
                  <ul className="list statement-lines">
                    {statement.lines.map((l) => (
                      <li key={l.id} className="statement-line">
                        <div className="job-card-top">
                          <strong>{l.kind === "fee" ? es.proStatement.feeLine : (es.trades[l.trade as keyof typeof es.trades] ?? l.trade)}</strong>
                          <span className="muted">{l.released_on}</span>
                        </div>
                        <div className="muted">{l.zone}</div>
                        <dl className="statement-line-figures">
                          <div><dt>{es.proStatement.gross}</dt><dd>{money(l.gross)}</dd></div>
                          <div><dt>{es.proStatement.commission}</dt><dd>−{money(l.commission)}</dd></div>
                          <div><dt>{es.proStatement.tips}</dt><dd>{money(l.tip)}</dd></div>
                          <div><dt>{es.proStatement.net}</dt><dd>{money(l.net)}</dd></div>
                        </dl>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </article>
          )}

          {statement ? <PrintButton /> : null}
        </>
      )}
      <Link className="muted no-print" href="/pro/pagos">{es.proStatement.back}</Link>
    </section>
  );
}
