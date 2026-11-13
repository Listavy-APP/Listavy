"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { moderateReview } from "@/lib/data/reviews";

export function ModerationButtons({ reviewId, status }: { reviewId: string; status: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: "publish" | "hide" | "remove") {
    setError(null);
    setBusy(true);
    try {
      await moderateReview(createSupabaseBrowserClient(), reviewId, action, action === "publish" ? null : reason);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (mínimo 10 caracteres para ocultar o retirar)"
      />
      {error ? <p className="error">{error}</p> : null}
      <div className="row">
        {status !== "published" ? (
          <button className="button secondary" type="button" disabled={busy} onClick={() => act("publish")}>
            Publicar
          </button>
        ) : null}
        {status === "published" ? (
          <button className="button secondary" type="button" disabled={busy} onClick={() => act("hide")}>
            Ocultar
          </button>
        ) : null}
        {status !== "removed" ? (
          <button className="button secondary" type="button" disabled={busy} onClick={() => act("remove")}>
            Retirar
          </button>
        ) : null}
      </div>
    </div>
  );
}
