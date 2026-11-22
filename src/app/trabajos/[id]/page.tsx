import Link from "next/link";
import { getTradeMap } from "@/lib/data/trades-server";
import { proLabelOf } from "@/lib/data/trades";
import { BackArrow } from "@/components/BackBar";
import { notFound, redirect } from "next/navigation";
import { JobActions } from "./JobActions";
import { ReferralPrompt } from "@/components/ReferralPrompt";
import { RecurringPanel } from "./RecurringPanel";
import { getJobProperty, listMyProperties } from "@/lib/data/properties";
import { liveRecurringForJob } from "@/lib/data/recurring";
import { JobTimeline } from "./JobTimeline";
import { VoiceNote } from "./VoiceNote";
import { DisputePanel } from "./DisputePanel";
import { ReviewPanel } from "./ReviewPanel";
import { getJobReview, hasClientRating, hasReviewFlag } from "@/lib/data/reviews";
import { disputePhotoUrl, listDisputePhotos, listEvidence, listJobDisputes } from "@/lib/data/disputes";
import { getCompletionCode, getContactPhone, jobFileUrl, type JobPhotoRow, type JobRow, type QuoteRow } from "@/lib/data/jobs";
import { getProCard } from "@/lib/data/pros";
import { verifiedKindsByPro } from "@/lib/data/verifiedFlags";
import type { VerifiedKind } from "@/lib/domain/verifiedIcon";
import { es } from "@/lib/i18n/es";
import { scheduleText } from "@/components/ScheduleText";
import { ScheduleEditor } from "./ScheduleEditor";
import { avatarUrl } from "@/lib/storage/proFiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { connection } from "next/server";
import { isUuid } from "@/lib/domain/uuid";

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
  const tm = await getTradeMap();
  const { id } = await params;
  if (!isUuid(id)) notFound();
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

  const [quotesRes, photosRes, myReportsRes] = await Promise.all([
    supabase.from("quotes").select("*").eq("job_id", id).order("invited_at", { ascending: true }),
    supabase.from("job_photos").select("id, kind, storage_path").eq("job_id", id).order("created_at", { ascending: true }),
    // RLS: a user reads only their own reports, so this lists the photos this viewer already reported.
    supabase.from("job_photo_reports").select("storage_path").eq("job_id", id).eq("reported_by", uid),
  ]);
  const reportedPaths = (myReportsRes.data ?? []).map((r) => r.storage_path as string);
  const quotes = (quotesRes.data ?? []) as QuoteRow[];
  const photos = (photosRes.data ?? []) as JobPhotoRow[];

  const photoUrls = await Promise.all(
    photos.map(async (p) => ({ kind: p.kind, path: p.storage_path, url: await jobFileUrl(supabase, p.storage_path) })),
  );

  // Who sent each quote. Public pro cards only (approved pros), so no private data is read.
  const proIds = [...new Set(quotes.map((q) => q.pro_id))];
  const proCards = await Promise.all(proIds.map((pid) => getProCard(supabase, pid)));
  // Verified icon kinds for the quoting pros, one call. Icon only when the stages are complete.
  const verifiedKinds = await verifiedKindsByPro(
    supabase,
    proIds.map((pid) => ({ id: pid, isCompany: proCards[proIds.indexOf(pid)]?.pro_type === "company" })),
  );
  const pros: Record<string, { name: string | null; avatarUrl: string | null; verified: VerifiedKind | null }> = {};
  proIds.forEach((pid, i) => {
    const card = proCards[i];
    pros[pid] = {
      name: card?.full_name ?? null,
      avatarUrl: card ? avatarUrl(supabase, card.avatar_path) : null,
      verified: verifiedKinds.get(pid) ?? null,
    };
  });

  // What the homeowner will pay: the approved quote minus any paid diagnostic (D13).
  let pay: { quoteDop: number; creditDop: number; fx: number; urgentFeeDop: number } | null = null;
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
      pay = {
    quoteDop: approved.amount_dop,
    creditDop,
    fx: Number(j.fx_rate_dop_per_usd),
    urgentFeeDop: j.urgent ? (j.urgent_fee_dop ?? 0) : 0,
  };
    }
  }
  // Back from checkout. The webhook marks the job paid a moment later, so until then the pay
  // sheet is hidden: showing it again would invite a second payment.
  const payConfirming = pago === "ok" && pay !== null;
  if (payConfirming) pay = null;
  const payCancelled = pago === "cancelado" && pay !== null;

  const voiceUrl = j.voice_path ? await jobFileUrl(supabase, j.voice_path) : null;
  const recurring = role === "homeowner" && j.status === "completed" ? await liveRecurringForJob(supabase, id) : null;
  // B2B property (0119). Notes come back only where the database allows them (owner, or booked and paid pro).
  const propertyView = j.property_id ? await getJobProperty(supabase, id) : null;
  const myProperties = role === "homeowner" && j.status === "completed" ? await listMyProperties(supabase) : [];
  const disputes = await listJobDisputes(supabase, id);
  const jobReview = await getJobReview(supabase, id);
  const clientRated = role === "pro" ? await hasClientRating(supabase, id) : false;
  const reviewReported = jobReview ? await hasReviewFlag(supabase, jobReview.id) : false;
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
    .select("status, amount_dop, pro_payout_dop, urgent_fee_pro_dop, keep_pro_payout_dop, keep_dop, refunded_minor, fx_rate_dop_per_usd")
    .eq("job_id", id)
    .in("purpose", ["job", "diagnostic"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  type PayRow = {
    status: string;
    amount_dop: number | null;
    pro_payout_dop: number | null;
    urgent_fee_pro_dop: number | null;
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
        // The pro's share includes the whole urgent fee (0117), except when a cancel fee is kept instead.
        amount: role === "pro"
          ? (pr.keep_pro_payout_dop ?? (pr.pro_payout_dop ?? 0) + (pr.urgent_fee_pro_dop ?? 0))
          : pr.amount_dop,
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
        {proLabelOf(tm, j.trade)} · {j.zone}
      </h1>
      {j.urgent ? (
        <p>
          <span className="badge">{es.urgent.badge}</span>{" "}
          {role === "pro"
            ? es.urgent.proEarn(j.urgent_fee_dop ?? 0)
            : es.urgent.feeLine(j.urgent_fee_dop ?? 0)}
        </p>
      ) : null}
      <p>{j.description}</p>
      <dl className="job-facts">
        <div>
          <dt className="muted">{es.jobs.dateLabel}</dt>
          <dd>{jobDate(j.created_at)}</dd>
        </div>
        <div>
          <dt className="muted">{es.schedule.requested}</dt>
          <dd>{scheduleText(j.scheduled_date, j.scheduled_window)}</dd>
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

      {role === "homeowner" && j.status === "requested" && !j.approved_quote_id ? (
        <ScheduleEditor jobId={j.id} date={j.scheduled_date} window={j.scheduled_window} />
      ) : role === "homeowner" && j.status !== "requested" && j.status !== "cancelled" ? (
        <p className="muted">{es.schedule.locked}</p>
      ) : null}
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
        reportedPaths={reportedPaths}
        contactPhone={contactPhone}
        completionCode={completionCode}
      />
      {j.status === "completed" && role === "homeowner" ? <ReferralPrompt supabase={supabase} /> : null}
      {propertyView ? (
        <section className="panel stack">
          <h2>{es.properties.jobProperty}</h2>
          <p><strong>{propertyView.property_name}</strong>, {propertyView.municipality_name}</p>
          {propertyView.address_detail ? <p className="muted">{propertyView.address_detail}</p> : null}
          {propertyView.business_name ? <p className="muted">{es.properties.businessName}: {propertyView.business_name}</p> : null}
          {propertyView.access_notes ? <p className="muted">{es.properties.accessNotes}: {propertyView.access_notes}</p> : null}
        </section>
      ) : null}
      {j.status === "completed" && role === "homeowner" ? (
        <RecurringPanel
          jobId={j.id}
          proName={j.pro_id ? (pros[j.pro_id]?.name ?? null) : null}
          jobWindow={j.scheduled_window}
          existing={recurring}
          properties={myProperties}
        />
      ) : null}
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
        reported={reviewReported}
      />
    </section>
  );
}
