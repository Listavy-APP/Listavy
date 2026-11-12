import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JobActions } from "./JobActions";
import { JobTimeline } from "./JobTimeline";
import { VoiceNote } from "./VoiceNote";
import { DisputePanel } from "./DisputePanel";
import { listEvidence, listJobDisputes } from "@/lib/data/disputes";
import { getCompletionCode, getContactPhone, jobFileUrl, type JobPhotoRow, type JobRow, type QuoteRow } from "@/lib/data/jobs";
import { getProCard } from "@/lib/data/pros";
import { es } from "@/lib/i18n/es";
import { avatarUrl } from "@/lib/storage/proFiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { connection } from "next/server";

export const metadata = { title: es.jobs.jobTitle };
export const instant = false;

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
    // Per-request render: the session is read at request time.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
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
    photos.map(async (p) => ({ kind: p.kind, url: await jobFileUrl(supabase, p.storage_path) })),
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

  const voiceUrl = j.voice_path ? await jobFileUrl(supabase, j.voice_path) : null;
  const disputes = await listJobDisputes(supabase, id);
  const disputeEvidence = await listEvidence(supabase, disputes.map((d) => d.id));

  const contactPhone = await getContactPhone(supabase, id);
  const completionCode =
    role === "pro" && j.status === "in_progress" ? await getCompletionCode(supabase, id) : null;

  return (
    <section className="stack">
      <div className="backbar">
        <Link className="back" href={role === "pro" ? "/pro/solicitudes" : "/cuenta"} aria-label={es.common.back}>
          ‹
        </Link>
        <span className="bt">{es.jobs.jobTitle}</span>
      </div>

      <h1>
        {es.trades[j.trade as keyof typeof es.trades] ?? j.trade} · {j.zone}
      </h1>
      <p>{j.description}</p>
      <p className="muted">
        {j.job_type === "diagnostic" ? es.jobs.typeDiagnostic : es.jobs.typeRepair} ·{" "}
        {j.status === "accepted" && j.payment_status === "unpaid"
          ? es.jobs.statusAcceptedUnpaid
          : (es.jobs.statusLabel[j.status as keyof typeof es.jobs.statusLabel] ?? j.status)}
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
      <DisputePanel
        jobId={id}
        role={role}
        approvedAt={j.approved_at}
        jobStatus={j.status}
        disputes={disputes}
        evidence={disputeEvidence}
      />
    </section>
  );
}
