"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DISPUTE_PHOTO_MAX_PER_AUTHOR,
  openDispute,
  registerDisputePhoto,
  submitEvidence,
  uploadDisputePhoto,
  type DisputeRow,
  type EvidenceRow,
} from "@/lib/data/disputes";
import { es } from "@/lib/i18n/es";
import { esTrust } from "@/lib/i18n/trust";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** A dispute photo with a signed link, prepared on the server. */
export interface DisputePhotoView {
  id: string;
  dispute_id: string;
  side: "homeowner" | "pro";
  url: string | null;
}

/** Deadline text that never splits "5:47 p. m." across lines. */
function formatDue(iso: string): string {
  return new Date(iso)
    .toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "medium", timeStyle: "short" })
    .replace(/ (\d{1,2}:\d{2})\s?([ap])\.?\s?m\.?/i, (_, t, ap) => `\u00A0${t}\u00A0${ap.toLowerCase()}.\u00A0m.`);
}

/** One statement: a party label and a left rule. No avatars. */
function Statement({ side, text }: { side: "homeowner" | "pro"; text: string }) {
  return (
    <div className={`statement statement-${side}`}>
      <span className="statement-label">{side === "homeowner" ? "Cliente" : "Profesional"}</span>
      <p>{text}</p>
    </div>
  );
}

function PhotoStrip({ photos, label }: { photos: DisputePhotoView[]; label: string }) {
  if (photos.length === 0) return null;
  return (
    <div className="photo-grid" aria-label={label}>
      {photos.map((p) => (
        <figure key={p.id} className="photo-tile">
          {p.url ? (
            <a href={p.url} target="_blank" rel="noreferrer" aria-label={esTrust.disputePhotos.openPhoto}>
              {/* Signed URL, private bucket. next/image cannot optimize signed URLs. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={label} loading="lazy" />
            </a>
          ) : (
            <div className="photo-missing" aria-hidden="true" />
          )}
        </figure>
      ))}
    </div>
  );
}

export function DisputePanel({
  jobId,
  uid,
  role,
  approvedAt,
  jobStatus,
  disputes,
  evidence,
  photos,
}: {
  jobId: string;
  uid: string;
  role: "homeowner" | "pro";
  approvedAt: string | null;
  jobStatus: string;
  disputes: DisputeRow[];
  evidence: EvidenceRow[];
  photos: DisputePhotoView[];
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [reason, setReason] = useState("");
  const [latent, setLatent] = useState(false);
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = Date.now();
  const current = disputes[0];
  const withinFilingWindow =
    jobStatus === "completed" && approvedAt !== null && now <= new Date(approvedAt).getTime() + 48 * 3600 * 1000;

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.jobs.genericError);
    } finally {
      setBusy(false);
    }
  }

  if (!current) {
    if (!withinFilingWindow) return null;
    return (
      <section className="panel dispute-card stack">
        <h2>{es.disputes.openTitle}</h2>
        <p className="muted">{es.disputes.openHelp}</p>
        {error ? <p className="error">{error}</p> : null}
        <label className="field">
          {es.disputes.reasonLabel}
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label className="row">
          <input type="checkbox" checked={latent} onChange={(e) => setLatent(e.target.checked)} />
          {es.disputes.latent}
        </label>
        <button
          className="button danger"
          type="button"
          disabled={busy || reason.trim().length < 10}
          onClick={() => run(() => openDispute(supabase, { jobId, latent, reason }))}
        >
          {es.disputes.open}
        </button>
      </section>
    );
  }

  const mine = evidence.find((e) => e.dispute_id === current.id && e.side === role);
  const others = evidence.filter((e) => e.dispute_id === current.id && e.side !== role);
  const stillOpen = current.stage === "evidence" && current.evidence_due_at !== null && new Date(current.evidence_due_at).getTime() > now;
  const showOthers = current.stage !== "evidence" && current.stage !== "filed";
  const disputePhotos = photos.filter((p) => p.dispute_id === current.id);
  const myPhotos = disputePhotos.filter((p) => p.side === role);
  const otherPhotos = disputePhotos.filter((p) => p.side !== role);
  const canAttach = stillOpen && mine !== undefined && myPhotos.length < DISPUTE_PHOTO_MAX_PER_AUTHOR;

  async function attachPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = DISPUTE_PHOTO_MAX_PER_AUTHOR - myPhotos.length;
    const batch = Array.from(files).slice(0, room);
    await run(async () => {
      for (const file of batch) {
        const path = await uploadDisputePhoto(supabase, uid, current.id, file);
        await registerDisputePhoto(supabase, current.id, path);
      }
    });
  }

  return (
    <section className="panel dispute-card stack">
      <div className="dispute-head">
        <h2>{es.disputes.title}</h2>
        <span className={`dispute-stage stage-${current.stage}`}>{es.disputes.stage[current.stage]}</span>
      </div>
      {stillOpen && current.evidence_due_at ? (
        <p className="muted dispute-due">{`${es.disputes.windowOpen} ${formatDue(current.evidence_due_at)}`}</p>
      ) : null}
      {current.stage === "evidence" && !stillOpen ? <p className="muted">{es.disputes.windowClosed}</p> : null}

      {current.stage === "evidence" && stillOpen ? (
        mine ? (
          <div className="stack">
            <p className="muted">{es.disputes.evidenceSent}</p>
            <Statement side={role} text={mine.statement} />
            <PhotoStrip photos={myPhotos} label={esTrust.disputePhotos.ownLabel} />
            <h3>{esTrust.disputePhotos.title}</h3>
            <p className="muted">{esTrust.disputePhotos.help}</p>
            {error ? <p className="error">{error}</p> : null}
            {canAttach ? (
              <label className="button secondary">
                {busy ? esTrust.disputePhotos.uploading : esTrust.disputePhotos.addPhotos}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  disabled={busy}
                  onChange={(e) => {
                    void attachPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            ) : (
              <p className="muted">{esTrust.disputePhotos.limitReached}</p>
            )}
          </div>
        ) : (
          <div className="stack">
            <h3>{es.disputes.evidenceTitle}</h3>
            <p className="muted">{es.disputes.evidenceHelp}</p>
            {error ? <p className="error">{error}</p> : null}
            <textarea rows={4} value={statement} onChange={(e) => setStatement(e.target.value)} />
            <button
              className="button"
              type="button"
              disabled={busy || statement.trim().length < 10}
              onClick={() => run(() => submitEvidence(supabase, current.id, statement))}
            >
              {es.disputes.evidenceSend}
            </button>
          </div>
        )
      ) : null}

      {showOthers
        ? [mine, ...others].filter(Boolean).map((e) => (
            <Statement key={`${e!.side}-${e!.created_at}`} side={e!.side} text={e!.statement} />
          ))
        : null}
      {showOthers ? <PhotoStrip photos={otherPhotos} label={esTrust.disputePhotos.counterpartLabel} /> : null}
      {showOthers ? <PhotoStrip photos={myPhotos} label={esTrust.disputePhotos.ownLabel} /> : null}

      {current.decision_reason ? (
        <div className="dispute-decision">
          <span className="statement-label">{es.disputes.decisionTitle}</span>
          <p>{current.decision_reason}</p>
        </div>
      ) : null}
    </section>
  );
}
