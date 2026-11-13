"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const MIN_REASON = 10;

/** Clears the client's low-rating count (migration 0032). The reason is stored in client_rating_clears. */
export function ClearLimitButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = reason.trim();

  async function onClear() {
    setError(null);
    if (trimmed.length < MIN_REASON) {
      setError(`Escribe el motivo (mínimo ${MIN_REASON} caracteres).`);
      return;
    }
    setBusy(true);
    try {
      const { error: rpcError } = await createSupabaseBrowserClient().rpc("clear_client_rating_limit", {
        p_client: clientId,
        p_reason: trimmed,
      });
      if (rpcError) throw new Error(rpcError.message);
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo limpiar el contador.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="button secondary" type="button" onClick={() => setOpen(true)}>
        Limpiar límite del cliente
      </button>
    );
  }

  return (
    <div className="stack">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={`Motivo del cambio (mínimo ${MIN_REASON} caracteres)`}
      />
      <span className="muted">
        {trimmed.length}/{MIN_REASON} caracteres mínimos
      </span>
      {error ? <p className="error">{error}</p> : null}
      <div className="row">
        <button className="button" type="button" disabled={busy || trimmed.length < MIN_REASON} onClick={onClear}>
          Confirmar limpieza
        </button>
        <button className="button secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
