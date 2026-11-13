"use client";

import { EmptyState } from "@/components/EmptyState";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addJobPhoto,
  approveCloseout,
  approveQuote,
  approveRevision,
  cancelJobRequest,
  proposeRevision,
  startJob,
  submitCloseout,
  uploadJobFile,
  type JobRow,
  type QuoteRow,
} from "@/lib/data/jobs";
import { Choice } from "@/components/ui/Choice";
import { FilePick } from "@/components/ui/FilePick";
import { TextArea } from "@/components/ui/TextArea";
import { es } from "@/lib/i18n/es";
import { resizeImage } from "@/lib/media/resize";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PaySheet } from "./PaySheet";
import { QuoteCard } from "./QuoteCard";

type Photo = { kind: "request" | "before" | "after"; url: string | null };

export function JobActions(props: {
  userId: string;
  role: "homeowner" | "pro";
  job: JobRow;
  quotes: QuoteRow[];
  pros: Record<string, { name: string | null; avatarUrl: string | null }>;
  pay: { quoteDop: number; creditDop: number; fx: number } | null;
  photos: Photo[];
  contactPhone: string | null;
  completionCode: string | null;
}) {
  const router = useRouter();
  const { job, role, quotes, photos } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [beforeFiles, setBeforeFiles] = useState<File[]>([]);
  const [afterFiles, setAfterFiles] = useState<File[]>([]);

  const supabase = () => createSupabaseBrowserClient();

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.jobs.genericError);
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhotos(files: File[], kind: "before" | "after") {
    for (const f of files) {
      const blob = await resizeImage(f);
      const path = await uploadJobFile(supabase(), props.userId, blob, "jpg");
      await addJobPhoto(supabase(), job.id, kind, path);
    }
  }

  const isDiagnostic = job.job_type === "diagnostic";
  const paid = job.payment_status === "paid";
  const pendingRevision = quotes.find((q) => q.revision_of && q.status === "sent") ?? null;
  const [revAmount, setRevAmount] = useState("");
  const [revIncludes, setRevIncludes] = useState("");
  const [revExcludes, setRevExcludes] = useState("");
  const [revMaterials, setRevMaterials] = useState<"yes" | "no" | "">("");
  const [revStart, setRevStart] = useState("");
  const [revEnd, setRevEnd] = useState("");
  const [revDuration, setRevDuration] = useState("");
  const [revReason, setRevReason] = useState("");

  return (
    <div className="stack">
      {props.contactPhone ? (
        <p className="ok">
          {es.jobs.contactLabel}: <a href={`tel:${props.contactPhone}`}>{props.contactPhone}</a>
        </p>
      ) : (
        <p className="muted">{es.jobs.contactHidden}</p>
      )}

      <h2>{es.jobs.photosTitle}</h2>
      {photos.length === 0 ? (
        <EmptyState title={es.jobs.noPhotos} body={es.jobs.noPhotosBody} />
      ) : (
        <div className="photo-grid">
          {photos.map((p, i) => (
            <figure key={i} className="photo-tile">
              {p.url ? (
                <a href={p.url} target="_blank" rel="noreferrer" aria-label={es.jobs.openPhoto}>
                  {/* Signed URL, private bucket. Thumbnail only; next/image cannot optimize signed URLs. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={es.jobs.photoKind[p.kind]} loading="lazy" />
                </a>
              ) : (
                <div className="photo-missing" aria-hidden="true" />
              )}
              <figcaption className="muted">{es.jobs.photoKind[p.kind]}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {job.status === "requested" || job.status === "quoted" ? (
        <>
          <h2>{es.jobs.quotesTitle}</h2>
          {quotes.length === 0 ? <p className="muted">{es.jobs.noQuotes}</p> : null}
          {quotes.map((q) => (
            <QuoteCard
              key={q.id}
              quote={q}
              pro={props.pros[q.pro_id]}
              busy={busy}
              onApprove={role === "homeowner" ? () => run(() => approveQuote(supabase(), q.id)) : undefined}
            />
          ))}
          {role === "homeowner" ? (
            <button className="button secondary" type="button" disabled={busy}
              onClick={() => run(() => cancelJobRequest(supabase(), job.id))}>
              {es.jobs.cancel}
            </button>
          ) : null}
        </>
      ) : null}

      {role === "homeowner" && job.status === "accepted" && !paid ? (
        props.pay ? (
          <PaySheet jobId={job.id} quoteDop={props.pay.quoteDop} creditDop={props.pay.creditDop} fx={props.pay.fx} />
        ) : (
          <p className="muted">{es.jobs.payHint}</p>
        )
      ) : null}

      {role === "pro" && job.status === "accepted" ? (
        <>
          {!paid ? <p className="muted">{es.jobs.awaitingPayment}</p> : null}
          <FilePick
            label={es.jobs.beforePhotos}
            buttonLabel={es.common.chooseMany}
            accept="image/*"
            multiple
            disabled={busy}
            files={beforeFiles}
            onFiles={setBeforeFiles}
          />
          {beforeFiles.length === 0 ? <p className="muted">{es.jobs.beforeRequired}</p> : null}
          <button className="button" type="button" disabled={busy || !paid || beforeFiles.length === 0}
            onClick={() =>
              run(async () => {
                await uploadPhotos(beforeFiles, "before");
                await startJob(supabase(), job.id);
              })
            }>
            {es.jobs.start}
          </button>
        </>
      ) : null}

      {role === "pro" && job.status === "in_progress" ? (
        <>
          {props.completionCode ? (
            <p className="ok">{es.jobs.completionCodeForClient(props.completionCode)}</p>
          ) : null}
          {isDiagnostic ? (
            <TextArea label={es.jobs.diagnosisLabel} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
          ) : (
            <FilePick
              label={es.jobs.afterPhotos}
              buttonLabel={es.common.chooseMany}
              accept="image/*"
              multiple
              disabled={busy}
              files={afterFiles}
              onFiles={setAfterFiles}
            />
          )}
          <button className="button" type="button" disabled={busy}
            onClick={() =>
              run(async () => {
                if (!isDiagnostic) await uploadPhotos(afterFiles, "after");
                await submitCloseout(supabase(), job.id, isDiagnostic ? diagnosis : undefined);
              })
            }>
            {es.jobs.closeOut}
          </button>
        </>
      ) : null}

      {role === "homeowner" && job.status === "awaiting_approval" ? (
        <>
          {isDiagnostic ? (
            <>
              <p>{job.diagnosis_text}</p>
              <button className="button" type="button" disabled={busy}
                onClick={() => run(() => approveCloseout(supabase(), job.id))}>
                {es.jobs.confirmVisit}
              </button>
            </>
          ) : (
            <>
              <label className="field">
                <span>{es.jobs.codeLabel}</span>
                <input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              </label>
              <button className="button" type="button" disabled={busy || code.length !== 6}
                onClick={() => run(() => approveCloseout(supabase(), job.id, code))}>
                {es.jobs.approveWork}
              </button>
            </>
          )}
        </>
      ) : null}

      {job.status === "in_progress" && !isDiagnostic ? (
        <section className="stack">
          <h2>{es.jobs.revisionTitle}</h2>
          {pendingRevision ? (
            <>
              <p>{es.jobs.revisionPending(pendingRevision.amount_dop ?? 0)}</p>
              <p className="muted">{pendingRevision.includes}</p>
              <p className="muted">{pendingRevision.revision_reason}</p>
              {role === "homeowner" ? (
                <button className="button" type="button" disabled={busy}
                  onClick={() => run(() => approveRevision(supabase(), pendingRevision.id))}>
                  {es.jobs.approveRevision}
                </button>
              ) : (
                <p className="muted">{es.jobs.revisionSent}</p>
              )}
            </>
          ) : null}
          {job.pending_difference_dop !== 0 && job.pending_difference_dop !== undefined ? (
            <p className="muted">{es.jobs.revisionDifference(job.pending_difference_dop)}</p>
          ) : null}
          {role === "pro" && !pendingRevision ? (
            <div className="stack">
              <label className="field"><span>{es.jobs.amountLabel}</span>
                <input inputMode="numeric" value={revAmount} onChange={(e) => setRevAmount(e.target.value.replace(/\D/g, ""))} /></label>
              <TextArea label={es.jobs.includesLabel} rows={3} value={revIncludes} onChange={(e) => setRevIncludes(e.target.value)} />
              <TextArea label={es.jobs.excludesLabel} rows={2} value={revExcludes} onChange={(e) => setRevExcludes(e.target.value)} />
              <Choice
                legend={es.jobs.materialsLabel}
                name="rev-mat"
                value={revMaterials}
                options={[
                  { value: "yes", label: es.jobs.materialsYes },
                  { value: "no", label: es.jobs.materialsNo },
                ]}
                onChange={setRevMaterials}
              />
              <label className="field"><span>{es.jobs.startLabel}</span>
                <input type="datetime-local" value={revStart} onChange={(e) => setRevStart(e.target.value)} /></label>
              <label className="field"><span>{es.jobs.endLabel}</span>
                <input type="datetime-local" value={revEnd} onChange={(e) => setRevEnd(e.target.value)} /></label>
              <label className="field"><span>{es.jobs.durationLabel}</span>
                <input inputMode="decimal" value={revDuration} onChange={(e) => setRevDuration(e.target.value)} /></label>
              <TextArea label={es.jobs.revisionReason} rows={3} value={revReason} onChange={(e) => setRevReason(e.target.value)} />
              <button className="button" type="button" disabled={busy || revMaterials === ""}
                onClick={() =>
                  run(async () => {
                    await proposeRevision(supabase(), job.id, {
                      amountDop: Number(revAmount),
                      includes: revIncludes.trim(),
                      excludes: revExcludes.trim(),
                      materialsIncluded: revMaterials === "yes",
                      windowStart: new Date(revStart).toISOString(),
                      windowEnd: new Date(revEnd).toISOString(),
                      durationHours: Number(revDuration),
                      reason: revReason.trim(),
                    });
                  })
                }>
                {es.jobs.revisionForm}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {job.status === "completed" ? <p className="ok">{es.jobs.completed}</p> : null}
      {job.status === "cancelled" ? <p className="muted">{es.jobs.cancelled}</p> : null}

      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
