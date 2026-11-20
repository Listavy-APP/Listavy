"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { moderateReviewResponse } from "@/lib/data/reviews";

export function ReplyModerationButtons({ reviewId, status }: { reviewId: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: "publish" | "hide") {
    setError(null);
    setBusy(true);
    try {
      await moderateReviewResponse(createSupabaseBrowserClient(), reviewId, action);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="row">
        {status !== "published" ? (
          <button className="button secondary" type="button" disabled={busy} onClick={() => act("publish")}>
            Publicar respuesta
          </button>
        ) : (
          <button className="button secondary" type="button" disabled={busy} onClick={() => act("hide")}>
            Ocultar respuesta
          </button>
        )}
      </div>
    </div>
  );
}
