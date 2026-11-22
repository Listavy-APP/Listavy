import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { getClientStatement } from "@/lib/data/properties";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.clientStatement.title };
export const instant = false;

const DOP = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

/** Current year and month in Santo Domingo time. */
function currentYm(): { y: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month") };
}

/** Monthly resumen (0119). Not a comprobante fiscal: headed and caveated on the page. */
export default async function ClientStatementPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/cuenta/propiedades/resumen");

  const { mes } = await searchParams;
  const match = /^(\d{4})-(\d{2})$/.exec(mes ?? "");
  const cur = currentYm();
  const y = match ? Number(match[1]) : cur.y;
  const m = match ? Number(match[2]) : cur.m;
  const valid = m >= 1 && m <= 12 && y >= 2020 && y <= 2100;
  const value = `${valid ? y : cur.y}-${String(valid ? m : cur.m).padStart(2, "0")}`;

  let statement: Awaited<ReturnType<typeof getClientStatement>> | null = null;
  let failed = false;
  try {
    statement = await getClientStatement(supabase, valid ? y : cur.y, valid ? m : cur.m);
  } catch {
    failed = true;
  }

  return (
    <section className="stack">
      <BackBar href="/cuenta/propiedades" />
      <h1 className="page-title">{es.clientStatement.title}</h1>
      <p className="notice" role="note"><strong>{es.clientStatement.disclaimer}</strong></p>
      <p className="muted">{es.clientStatement.note}</p>

      <form className="row" method="get">
        <label className="field">
          {es.clientStatement.monthLabel}
          <input type="month" name="mes" defaultValue={value} />
        </label>
        <button className="button secondary" type="submit">{es.clientStatement.show}</button>
      </form>

      {failed || !statement ? <p className="error" role="alert">{es.clientStatement.loadError}</p> : null}

      {statement && statement.groups.length === 0 ? <p className="muted">{es.clientStatement.empty}</p> : null}

      {statement && statement.groups.length > 0 ? (
        <>
          <ul className="list">
            {statement.groups.map((g) => (
              <li key={g.property_id ?? "none"}>
                <strong>{g.property_id ? g.name : es.clientStatement.unassigned}</strong>
                <div>{es.clientStatement.jobs}: {g.job_count}</div>
                <div>{es.clientStatement.paid}: {DOP.format(g.paid_dop)}</div>
              </li>
            ))}
          </ul>
          <p>
            <strong>{es.clientStatement.totals}</strong>: {statement.total_jobs} {es.clientStatement.jobs.toLowerCase()}, {DOP.format(statement.total_paid_dop)}
          </p>
        </>
      ) : null}
    </section>
  );
}
