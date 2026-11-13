"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { openDispute, submitEvidence, type DisputeRow, type EvidenceRow } from "@/lib/data/disputes";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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

export function DisputePanel({
  jobId,
  role,
  approvedAt,
  jobStatus,
  disputes,
  evidence,
}: {
  jobId: string;
  role: "homeowner" | "pro";
  approvedAt: string | null;
  jobStatus: string;
  disputes: DisputeRow[];
  evidence: EvidenceRow[];
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

      {current.decision_reason ? (
        <div className="dispute-decision">
          <span className="statement-label">{es.disputes.decisionTitle}</span>
          <p>{current.decision_reason}</p>
        </div>
      ) : null}
    </section>
  );
}
