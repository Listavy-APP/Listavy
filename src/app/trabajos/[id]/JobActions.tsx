"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addJobPhoto,
  approveCloseout,
  approveQuote,
  cancelJobRequest,
  startJob,
  submitCloseout,
  uploadJobFile,
  type JobRow,
  type QuoteRow,
} from "@/lib/data/jobs";
import { es } from "@/lib/i18n/es";
import { resizeImage } from "@/lib/media/resize";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Photo = { kind: "request" | "before" | "after"; url: string | null };

export function JobActions(props: {
  userId: string;
  role: "homeowner" | "pro";
  job: JobRow;
  quotes: QuoteRow[];
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
        <p className="muted">{es.jobs.noPhotos}</p>
      ) : (
        <div className="stack">
          {photos.map((p, i) => (
            <p key={i}>
              <span className="muted">{es.jobs.photoKind[p.kind]}</span>{" "}
              {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{es.jobs.openPhoto}</a> : null}
            </p>
          ))}
        </div>
      )}

      {job.status === "requested" || job.status === "quoted" ? (
        <>
          <h2>{es.jobs.quotesTitle}</h2>
          {quotes.length === 0 ? <p className="muted">{es.jobs.noQuotes}</p> : null}
          {quotes.map((q) => (
            <article key={q.id} className="card stack">
              <strong>{q.status === "sent" ? es.money.dop(q.amount_dop ?? 0) : es.jobs.quoteStatus[q.status as keyof typeof es.jobs.quoteStatus] ?? q.status}</strong>
              {q.status === "sent" ? (
                <>
                  <p>{q.includes}</p>
                  {q.excludes ? <p className="muted">{es.jobs.excludesLabel}: {q.excludes}</p> : null}
                  <p className="muted">
                    {q.materials_included ? es.jobs.materialsYes : es.jobs.materialsNo} · {q.duration_hours} h
                  </p>
                </>
              ) : null}
              {role === "homeowner" && q.status === "sent" ? (
                <button className="button" type="button" disabled={busy} onClick={() => run(() => approveQuote(supabase(), q.id))}>
                  {es.jobs.approve}
                </button>
              ) : null}
            </article>
          ))}
          {role === "homeowner" ? (
            <button className="button secondary" type="button" disabled={busy}
              onClick={() => run(() => cancelJobRequest(supabase(), job.id))}>
              {es.jobs.cancel}
            </button>
          ) : null}
        </>
      ) : null}

      {role === "pro" && job.status === "accepted" ? (
        <>
          {!paid ? <p className="muted">{es.jobs.awaitingPayment}</p> : null}
          <label className="field">
            <span>{es.jobs.beforePhotos}</span>
            <input type="file" accept="image/*" multiple onChange={(e) => setBeforeFiles(Array.from(e.target.files ?? []))} />
          </label>
          <button className="button" type="button" disabled={busy || !paid}
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
            <label className="field">
              <span>{es.jobs.diagnosisLabel}</span>
              <textarea rows={4} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
            </label>
          ) : (
            <label className="field">
              <span>{es.jobs.afterPhotos}</span>
              <input type="file" accept="image/*" multiple onChange={(e) => setAfterFiles(Array.from(e.target.files ?? []))} />
            </label>
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

      {job.status === "completed" ? <p className="ok">{es.jobs.completed}</p> : null}
      {job.status === "cancelled" ? <p className="muted">{es.jobs.cancelled}</p> : null}

      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
