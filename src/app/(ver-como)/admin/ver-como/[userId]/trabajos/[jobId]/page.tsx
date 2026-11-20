import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { JobTimeline } from "@/app/trabajos/[id]/JobTimeline";
import { jobFileUrl } from "@/lib/data/jobs";
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
type QuoteRow = { quote_id: string; pro_name: string | null; amount_dop: number; quote_status: string; created_at: string; is_revision: boolean };
type PhotoRow = { photo_id: string; photo_kind: string; storage_path: string; created_at: string };
type PaymentRow = { amount_minor: number; currency: string; payment_status: string; created_at: string };
type DisputeRow = {
  dispute_id: string;
  opened_by_target: boolean;
  stage: string;
  dispute_status: string;
  outcome: string | null;
  refund_dop: number | null;
  opened_at: string;
  decided_at: string | null;
  decision_reason: string | null;
  payment_amount_minor: number | null;
  payment_currency: string | null;
};

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santo_Domingo" });

const money = (minor: number, currency: string | null) =>
  currency === "USD" ? esViewAs.moneyUsd(minor / 100) : esViewAs.moneyDop(minor / 100);

/**
 * One job as the target sees it. Every read goes through a gated definer (0100). Photo URLs are
 * signed only for paths the definer returned. Read-only: no action controls, no contact or completion data.
 */
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

  const [quotesRes, photosRes, paymentsRes, disputesRes] = await Promise.all([
    supabase.rpc("admin_view_as_quotes", { p_target: userId, p_job: jobId }),
    supabase.rpc("admin_view_as_job_photos", { p_target: userId, p_job: jobId }),
    supabase.rpc("admin_view_as_job_payments", { p_target: userId, p_job: jobId }),
    supabase.rpc("admin_view_as_job_disputes", { p_target: userId, p_job: jobId }),
  ]);
  const quotes = (quotesRes.data ?? []) as QuoteRow[];
  const photos = (photosRes.data ?? []) as PhotoRow[];
  const payments = (paymentsRes.data ?? []) as PaymentRow[];
  const disputes = (disputesRes.data ?? []) as DisputeRow[];

  const photoUrls = await Promise.all(
    photos.map(async (p) => ({ id: p.photo_id, kind: p.photo_kind, url: await jobFileUrl(supabase, p.storage_path) })),
  );

  // Same counting as /trabajos/[id]: revisions excluded, responded statuses from the page's list.
  const originals = quotes.filter((q) => !q.is_revision);
  const quotesTotal = originals.length;
  const quotesResponded = originals.filter((q) => ["sent", "accepted", "rejected", "withdrawn"].includes(q.quote_status)).length;

  return (
    <section className="stack">
      <BackBar href={`/admin/ver-como/${userId}/trabajos`} label={esViewAs.homeJobs} />
      <h1>{es.trades[job.trade as keyof typeof es.trades] ?? job.trade}</h1>
      <p className="muted">
        {job.viewer_role === "homeowner" ? esViewAs.roleHomeowner : esViewAs.rolePro} · {job.zone} · {dateLabel(job.created_at)}
      </p>
      <p><span className="status-pill">{es.profile.jobStatus[job.job_status as keyof typeof es.profile.jobStatus] ?? job.job_status}</span></p>
      {job.amount_dop !== null ? (
        <p><b>{esViewAs.jobAmount}:</b> {esViewAs.moneyDop(job.amount_dop)}</p>
      ) : null}
      {job.pro_name ? <p><b>{esViewAs.jobPro}:</b> {job.pro_name}</p> : null}

      <JobTimeline
        status={job.job_status}
        paymentStatus={job.payment_status}
        quotesResponded={quotesResponded}
        quotesTotal={quotesTotal}
      />

      <section className="stack" aria-labelledby="view-as-photos">
        <h2 id="view-as-photos">{esViewAs.photosTitle}</h2>
        {photoUrls.length === 0 ? <p className="muted">{esViewAs.noPhotos}</p> : (
          <div className="cards">
            {photoUrls.map((p) => p.url ? (
              <img
                key={p.id}
                src={p.url}
                alt={esViewAs.photoAlt(es.jobs.photoKind[p.kind as keyof typeof es.jobs.photoKind] ?? p.kind)}
                loading="lazy"
                width={160}
                height={160}
                style={{ objectFit: "cover", borderRadius: 8 }}
              />
            ) : null)}
          </div>
        )}
      </section>

      <section className="stack" aria-labelledby="view-as-payments">
        <h2 id="view-as-payments">{esViewAs.paymentsTitle}</h2>
        {payments.length === 0 ? <p className="muted">{esViewAs.noPayments}</p> : (
          <ul className="stack">
            {payments.map((p, i) => (
              <li key={i} className="panel">
                <b>{money(p.amount_minor, p.currency)}</b>
                <div className="muted">{esViewAs.paymentStatus[p.payment_status] ?? p.payment_status} · {dateLabel(p.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack" aria-labelledby="view-as-disputes">
        <h2 id="view-as-disputes">{esViewAs.disputesTitle}</h2>
        {disputes.length === 0 ? <p className="muted">{esViewAs.noDisputes}</p> : (
          <ul className="stack">
            {disputes.map((d) => (
              <li key={d.dispute_id} className="panel stack">
                <b>{es.disputes.stage[d.stage as keyof typeof es.disputes.stage] ?? d.stage}</b>
                <div className="muted">
                  {d.opened_by_target ? esViewAs.disputeOpenedByYou : esViewAs.disputeOpenedByOther} · {dateLabel(d.opened_at)}
                </div>
                {d.refund_dop && d.refund_dop > 0 ? <div>{esViewAs.disputeRefund(esViewAs.moneyDop(d.refund_dop))}</div> : null}
                {d.decided_at ? <div className="muted">{esViewAs.disputeDecided} · {dateLabel(d.decided_at)}</div> : null}
                {d.decision_reason ? <p>{d.decision_reason}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="muted">{esViewAs.partialNote}</p>
    </section>
  );
}
