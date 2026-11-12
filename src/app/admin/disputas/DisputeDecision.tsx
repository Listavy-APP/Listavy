"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { closeDispute, decideDispute, finishRedo, type DisputeOutcome, type DisputeRow } from "@/lib/data/disputes";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const OUTCOMES: { value: DisputeOutcome; label: string; post: boolean }[] = [
  { value: "release_full", label: "Liberar el pago al profesional", post: false },
  { value: "partial_refund", label: "Reembolso parcial", post: true },
  { value: "full_refund", label: "Reembolso total", post: true },
  { value: "redo", label: "Rehacer el trabajo", post: false },
];

export function DisputeDecision({ dispute }: { dispute: DisputeRow }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<DisputeOutcome>("release_full");
  const [refund, setRefund] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();
  const windowOpen = dispute.evidence_due_at ? new Date(dispute.evidence_due_at) > new Date() : false;

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  if (dispute.stage === "evidence") {
    if (windowOpen) return <p className="muted">La ventana de evidencia está abierta. No se puede decidir antes de que venza.</p>;
    return (
      <div className="stack">
        {error ? <p className="error">{error}</p> : null}
        <p className="muted">La ventana de evidencia venció. Puedes decidir.</p>
        <div className="chip-wrap">
          {OUTCOMES.map((o) => (
            <button key={o.value} type="button" className={outcome === o.value ? "chip on" : "chip"} onClick={() => setOutcome(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
        {outcome === "partial_refund" ? (
          <label className="field">
            Monto a reembolsar (RD$)
            <input inputMode="numeric" value={refund} onChange={(e) => setRefund(e.target.value.replace(/\D/g, ""))} />
          </label>
        ) : null}
        <label className="field">
          Motivo (se envía a ambas partes)
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button
          className="button"
          type="button"
          disabled={busy || reason.trim().length < 10}
          onClick={() =>
            run(() =>
              decideDispute(supabase, {
                disputeId: dispute.id,
                outcome,
                refundDop: outcome === "partial_refund" ? Number(refund) : null,
                reason,
              }),
            )
          }
        >
          Registrar decisión
        </button>
      </div>
    );
  }

  if (dispute.stage === "decided" && dispute.outcome === "redo") {
    return (
      <div className="stack">
        {error ? <p className="error">{error}</p> : null}
        <p className="muted">Esperando la aprobación del nuevo cierre del trabajo. El pago sigue retenido.</p>
        <button className="button secondary" type="button" disabled={busy} onClick={() => run(() => finishRedo(supabase, dispute.id))}>
          Marcar rediseño aprobado
        </button>
      </div>
    );
  }

  if (dispute.stage === "executed") {
    return (
      <div className="stack">
        {error ? <p className="error">{error}</p> : null}
        <button className="button secondary" type="button" disabled={busy} onClick={() => run(() => closeDispute(supabase, dispute.id))}>
          Cerrar disputa
        </button>
      </div>
    );
  }

  return null;
}
