import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { es } from "@/lib/i18n/es";
import { esViewAs } from "@/lib/i18n/view-as";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

type JobRow = {
  job_id: string;
  viewer_role: string;
  trade: string;
  zone: string;
  job_status: string;
  payment_status: string;
  created_at: string;
  amount_dop: number | null;
  pro_name: string | null;
};
type QuoteRow = { quote_id: string; pro_name: string | null; amount_dop: number; quote_status: string; created_at: string };

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santo_Domingo" });

export default async function ViewAsJob({
  params,
}: {
  params: Promise<{ userId: string; jobId: string }>;
}) {
  const { userId, jobId } = await params;
  await connection();
  const supabase = await createSupabaseServerClient();

  // Returns no row unless the target is this job's homeowner or pro (checked in the database).
  const { data: jobRows } = await supabase.rpc("admin_view_as_job", { p_target: userId, p_job: jobId });
  const job = ((jobRows ?? []) as JobRow[])[0];
  if (!job) notFound();

  const { data: quoteRows } = await supabase.rpc("admin_view_as_quotes", { p_target: userId, p_job: jobId });
  const quotes = (quoteRows ?? []) as QuoteRow[];

  return (
    <section className="stack">
      <BackBar href={`/admin/ver-como/${userId}/trabajos`} label={esViewAs.homeJobs} />
      <h1>{es.trades[job.trade as keyof typeof es.trades] ?? job.trade}</h1>
      <p className="muted">
        {job.viewer_role === "homeowner" ? esViewAs.roleHomeowner : esViewAs.rolePro} · {job.zone} · {dateLabel(job.created_at)}
      </p>
      <p><span className="status-pill">{es.profile.jobStatus[job.job_status as keyof typeof es.profile.jobStatus] ?? job.job_status}</span></p>
      {job.amount_dop !== null ? (
        <p><b>{esViewAs.jobAmount}:</b> RD${job.amount_dop.toLocaleString("es-DO")}</p>
      ) : null}
      {job.pro_name ? <p><b>{esViewAs.jobPro}:</b> {job.pro_name}</p> : null}

      <section className="stack" aria-labelledby="view-as-quotes">
        <h2 id="view-as-quotes">{esViewAs.jobQuotes}</h2>
        {quotes.length === 0 ? <p className="muted">{esViewAs.noQuotes}</p> : (
          <ul className="stack">
            {quotes.map((q) => (
              <li key={q.quote_id} className="panel">
                <b>{q.pro_name ?? esViewAs.jobPro}</b> · RD${q.amount_dop.toLocaleString("es-DO")}
                <div className="muted">{q.quote_status} · {dateLabel(q.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="muted">{esViewAs.partialNote}</p>
    </section>
  );
}
