"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { es } from "@/lib/i18n/es";
import { flagReview } from "@/lib/data/reviews";

// Reasons the reporter can pick. Same list as the backend flag_review RPC (migration 0030).
// "personal_data" hides the review at once. That is the backend's designed safety fast-path.
const FLAG_REASONS = ["personal_data", "abuse", "false_claim", "advertising", "other"] as const;
type FlagReason = (typeof FLAG_REASONS)[number];

/**
 * "Reportar" for one review: a button, an inline reason picker, and the already-reported state.
 * Reports never delete a review, except "personal_data", which the backend hides at once.
 * Callers must show this only to a signed-in viewer who is not the review's author.
 */
export function ReviewReport({ reviewId, alreadyReported }: { reviewId: string; alreadyReported: boolean }) {
  const router = useRouter();
  const [reported, setReported] = useState(alreadyReported);
  const [picking, setPicking] = useState(false);
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!reason) return;
    setError(null);
    setBusy(true);
    try {
      await flagReview(createSupabaseBrowserClient(), reviewId, reason);
      setReported(true);
      setPicking(false);
      setReason(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.reviews.fail);
    } finally {
      setBusy(false);
    }
  }

  if (reported) {
    return <p className="muted" role="status">{es.reviews.flagged}</p>;
  }

  if (!picking) {
    return (
      <button className="button secondary" type="button" onClick={() => setPicking(true)}>
        {es.reviews.flag}
      </button>
    );
  }

  return (
    <fieldset className="stack">
      <legend>{es.reviews.flagPrompt}</legend>
      {FLAG_REASONS.map((r) => (
        <button
          key={r}
          type="button"
          className={reason === r ? "button" : "button secondary"}
          aria-pressed={reason === r}
          disabled={busy}
          onClick={() => setReason(r)}
        >
          {es.reviews.flagReasons[r]}
        </button>
      ))}
      <p className="muted">{reason === "personal_data" ? es.reviews.flagNoteHidden : es.reviews.flagNote}</p>
      <button className="button" type="button" disabled={!reason || busy} onClick={onSubmit}>
        {es.reviews.flagSubmit}
      </button>
      <button
        className="button secondary"
        type="button"
        disabled={busy}
        onClick={() => {
          setPicking(false);
          setReason(null);
        }}
      >
        {es.reviews.flagCancel}
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </fieldset>
  );
}
