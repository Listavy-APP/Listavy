"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { openDispute, submitEvidence, type DisputeRow, type EvidenceRow } from "@/lib/data/disputes";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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
      <section className="stack">
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
    <section className="stack">
      <h2>{es.disputes.title}</h2>
      <p>
        <strong>{es.disputes.stage[current.stage]}</strong>
        {stillOpen && current.evidence_due_at ? ` · ${es.disputes.windowOpen} ${new Date(current.evidence_due_at).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "medium", timeStyle: "short" })}` : null}
      </p>
      {current.stage === "evidence" && !stillOpen ? <p className="muted">{es.disputes.windowClosed}</p> : null}

      {current.stage === "evidence" && stillOpen ? (
        mine ? (
          <div className="stack">
            <p className="muted">{es.disputes.evidenceSent}</p>
            <blockquote>
              <strong>{role === "homeowner" ? "Cliente" : "Profesional"}:</strong> {mine.statement}
            </blockquote>
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
            <blockquote key={`${e!.side}-${e!.created_at}`}>
              <strong>{e!.side === "homeowner" ? "Cliente" : "Profesional"}:</strong> {e!.statement}
            </blockquote>
          ))
        : null}

      {current.decision_reason ? (
        <p>
          <strong>{es.disputes.decisionTitle}:</strong> {current.decision_reason}
        </p>
      ) : null}
    </section>
  );
}
