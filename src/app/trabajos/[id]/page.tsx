import Link from "next/link";
import { BackArrow } from "@/components/BackBar";
import { notFound, redirect } from "next/navigation";
import { JobActions } from "./JobActions";
import { ReferralPrompt } from "@/components/ReferralPrompt";
import { JobTimeline } from "./JobTimeline";
import { VoiceNote } from "./VoiceNote";
import { DisputePanel } from "./DisputePanel";
import { ReviewPanel } from "./ReviewPanel";
import { getJobReview, hasClientRating } from "@/lib/data/reviews";
import { disputePhotoUrl, listDisputePhotos, listEvidence, listJobDisputes } from "@/lib/data/disputes";
import { getCompletionCode, getContactPhone, jobFileUrl, type JobPhotoRow, type JobRow, type QuoteRow } from "@/lib/data/jobs";
import { getProCard } from "@/lib/data/pros";
import { es } from "@/lib/i18n/es";
import { avatarUrl } from "@/lib/storage/proFiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { connection } from "next/server";

const jobDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santo_Domingo" });

export const metadata = { title: es.jobs.jobTitle };
export const instant = false;

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pago?: string }>;
}) {
  const { id } = await params;
  const { pago } = await searchParams;
    // Per-request render: the session is read at request time.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect(`/login?next=${encodeURIComponent(`/trabajos/${id}`)}`);
  const uid = userData.user.id;

  const { data: job } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
  if (!job) notFound();
  const j = job as JobRow;

  const role = j.homeowner_id === uid ? "homeowner" : j.pro_id === uid ? "pro" : null;
  if (!role) {
    // An invited pro who has not been chosen goes to the inbox.
    redirect("/pro/solicitudes");
  }

  const [quotesRes, photosRes] = await Promise.all([
    supabase.from("quotes").select("*").eq("job_id", id).order("invited_at", { ascending: true }),
    supabase.from("job_photos").select("id, kind, storage_path").eq("job_id", id).order("created_at", { ascending: true }),
  ]);
  const quotes = (quotesRes.data ?? []) as QuoteRow[];
  const photos = (photosRes.data ?? []) as JobPhotoRow[];

  const photoUrls = await Promise.all(
    photos.map(async (p) => ({ kind: p.kind, path: p.storage_path, url: await jobFileUrl(supabase, p.storage_path) })),
  );

  // Who sent each quote. Public pro cards only (approved pros), so no private data is read.
  const proIds = [...new Set(quotes.map((q) => q.pro_id))];
  const proCards = await Promise.all(proIds.map((pid) => getProCard(supabase, pid)));
  const pros: Record<string, { name: string | null; avatarUrl: string | null }> = {};
  proIds.forEach((pid, i) => {
    const card = proCards[i];
    pros[pid] = { name: card?.full_name ?? null, avatarUrl: card ? avatarUrl(supabase, card.avatar_path) : null };
  });

  // What the homeowner will pay: the approved quote minus any paid diagnostic (D13).
  let pay: { quoteDop: number; creditDop: number; fx: number } | null = null;
  if (role === "homeowner" && j.status === "accepted" && j.payment_status === "unpaid") {
    const approved = quotes.find((q) => q.id === j.approved_quote_id);
    if (approved?.amount_dop != null) {
      let creditDop = 0;
      if (j.credit_from_job_id) {
        const { data: credit } = await supabase
          .from("payments")
          .select("amount_dop")
          .eq("job_id", j.credit_from_job_id)
          .eq("purpose", "diagnostic")
          .in("status", ["held", "released"])
          .limit(1)
          .maybeSingle();
        creditDop = credit?.amount_dop ?? 0;
      }
      pay = { quoteDop: approved.amount_dop, creditDop, fx: Number(j.fx_rate_dop_per_usd) };
    }
  }
  // Back from checkout. The webhook marks the job paid a moment later, so until then the pay
  // sheet is hidden: showing it again would invite a second payment.
  const payConfirming = pago === "ok" && pay !== null;
  if (payConfirming) pay = null;
  const payCancelled = pago === "cancelado" && pay !== null;

  const voiceUrl = j.voice_path ? await jobFileUrl(supabase, j.voice_path) : null;
  const disputes = await listJobDisputes(supabase, id);
  const jobReview = await getJobReview(supabase, id);
  const clientRated = role === "pro" ? await hasClientRating(supabase, id) : false;
  const disputeEvidence = await listEvidence(supabase, disputes.map((d) => d.id));
  const disputePhotoRows = await listDisputePhotos(supabase, disputes.map((d) => d.id));
  const disputePhotos = await Promise.all(
    disputePhotoRows.map(async (p) => ({
      id: p.id,
      dispute_id: p.dispute_id,
      side: p.side,
      url: await disputePhotoUrl(supabase, p.storage_path),
    })),
  );

  const contactPhone = await getContactPhone(supabase, id);

  // Total and payment info. Amounts come from the approved quote and the job payment row.
  const approvedAmount = quotes.find((q) => q.id === j.approved_quote_id)?.amount_dop ?? null;
  const { data: paymentRow } = await supabase
    .from("payments")
    .select("status, amount_dop, pro_payout_dop, keep_pro_payout_dop, keep_dop, refunded_minor, fx_rate_dop_per_usd")
    .eq("job_id", id)
    .in("purpose", ["job", "diagnostic"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  type PayRow = {
    status: string;
    amount_dop: number | null;
    pro_payout_dop: number | null;
    keep_pro_payout_dop: number | null;
    keep_dop: number | null;
    refunded_minor: number | null;
    fx_rate_dop_per_usd: number | string | null;
  };
  const PAY_STATUS_LABEL: Record<string, string> = {
    released: es.jobs.payReleased,
    held: es.jobs.payHeld,
    refunded: es.jobs.payRefunded,
    disputed: es.jobs.payDisputed,
    pending: es.jobs.payPending,
  };
  // refunded_minor is in the provider currency (US cents). Show pesos: the charge minus what was
  // kept when that is recorded, otherwise the refund converted at the payment's own rate.
  function refundedPesos(p: PayRow): number {
    if (!p.refunded_minor || p.amount_dop === null) return 0;
    if (p.keep_dop !== null) return Math.max(0, p.amount_dop - p.keep_dop);
    const fx = Number(p.fx_rate_dop_per_usd);
    return Number.isFinite(fx) && fx > 0 ? Math.round((p.refunded_minor * fx) / 100) : 0;
  }
  const pr = paymentRow as PayRow | null;
  // The pro sees what they keep (after any partial refund). The client sees what they paid.
  const payment = pr && pr.amount_dop !== null
    ? {
        amount: role === "pro" ? (pr.keep_pro_payout_dop ?? pr.pro_payout_dop ?? 0) : pr.amount_dop,
        statusLabel: PAY_STATUS_LABEL[pr.status] ?? pr.status,
        refundedDop: role === "homeowner" ? refundedPesos(pr) : 0,
      }
    : null;
  const completionCode =
    role === "pro" && j.status === "in_progress" ? await getCompletionCode(supabase, id) : null;

  return (
    <section className="stack">
      <div className="backbar">
        <Link className="back" href={role === "pro" ? "/pro/solicitudes" : "/cuenta"} aria-label={es.common.back}><BackArrow /></Link>
        <span className="bt">{es.jobs.jobTitle}</span>
      </div>

      {payConfirming ? (
        <div className="panel stack" role="status">
          <b>{es.jobs.payConfirmingTitle}</b>
          <p>{es.jobs.payConfirmingBody}</p>
          <Link className="button secondary" href={`/trabajos/${id}`}>{es.jobs.payConfirmingRefresh}</Link>
        </div>
      ) : null}
      {payCancelled ? <p className="muted" role="status">{es.jobs.payCancelled}</p> : null}

      <h1>
        {es.trades[j.trade as keyof typeof es.trades] ?? j.trade} · {j.zone}
      </h1>
      <p>{j.description}</p>
      <dl className="job-facts">
        <div>
          <dt className="muted">{es.jobs.dateLabel}</dt>
          <dd>{jobDate(j.created_at)}</dd>
        </div>
        {approvedAmount !== null ? (
          <div>
            <dt className="muted">{es.jobs.totalLabel}</dt>
            <dd>RD${approvedAmount.toLocaleString("es-DO")}</dd>
          </div>
        ) : null}
        {payment ? (
          <div>
            <dt className="muted">{role === "pro" ? es.jobs.yourPayoutLabel : es.jobs.paidLabel}</dt>
            <dd>
              RD${payment.amount.toLocaleString("es-DO")} · {payment.statusLabel}
              {payment.refundedDop > 0 ? ` · ${es.jobs.refundedLabel(payment.refundedDop)}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="muted">
        {j.job_type === "diagnostic" ? es.jobs.typeDiagnostic : es.jobs.typeRepair} ·{" "}
        <span className="status-pill">
          {j.status === "accepted" && j.payment_status === "unpaid"
            ? es.jobs.statusAcceptedUnpaid
            : (es.jobs.statusLabel[j.status as keyof typeof es.jobs.statusLabel] ?? j.status)}
        </span>
      </p>

      {j.voice_path ? <VoiceNote url={voiceUrl} /> : null}
      {role === "pro" && j.location_consent && j.payment_status === "paid" ? (
        <p className="notice">{es.location.sharedWithPro}</p>
      ) : null}

      <JobTimeline
        status={j.status}
        paymentStatus={j.payment_status}
        quotesResponded={quotes.filter((q) => !q.revision_of && ["sent", "accepted", "rejected", "withdrawn"].includes(q.status)).length}
        quotesTotal={quotes.filter((q) => !q.revision_of).length}
      />

      <JobActions
        userId={uid}
        role={role}
        job={j}
        quotes={quotes}
        pros={pros}
        pay={pay}
        photos={photoUrls}
        contactPhone={contactPhone}
        completionCode={completionCode}
      />
      {j.status === "completed" && role === "homeowner" ? <ReferralPrompt supabase={supabase} /> : null}
      <DisputePanel
        jobId={id}
        uid={uid}
        role={role}
        approvedAt={j.approved_at}
        jobStatus={j.status}
        disputes={disputes}
        evidence={disputeEvidence}
        photos={disputePhotos}
      />
      <ReviewPanel
        jobId={id}
        role={role}
        jobStatus={j.status}
        paid={j.payment_status === "paid"}
        disputeOpen={disputes.some((d) => d.status === "open")}
        review={jobReview}
        hasClientRating={clientRated}
      />
    </section>
  );
}
