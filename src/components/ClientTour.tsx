"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useDialog } from "@/components/useDialog";
import { CLIENT_TOUR_STEPS, CLIENT_TOUR_STRINGS } from "@/lib/onboarding/clientTour";
import { tourFinishAction } from "@/lib/domain/clientTour";
import { stampClientTour } from "@/lib/data/profiles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * First-run client tour (8g). Three steps, skippable at every step (Saltar or Escape).
 * Mode "first" stamps the server flag once on finish or skip. Mode "replay" never touches it.
 * Fails open: a stamp error never blocks the screen. The dialog closes at once.
 */
export function ClientTour({ mode }: { mode: "first" | "replay" }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const total = CLIENT_TOUR_STEPS.length;
  const step = CLIENT_TOUR_STEPS[index];
  const last = index === total - 1;

  function close(then?: "pedir") {
    setOpen(false);
    if (tourFinishAction(mode) === "stamp") {
      // Fire and forget: the screen never waits on the stamp. Errors are swallowed on purpose.
      void stampClientTour(createSupabaseBrowserClient()).catch(() => {});
    }
    if (then === "pedir") router.push("/pedir");
  }

  // Escape skips. Focus stays in the dialog and returns to the previous element on close (8f hook).
  useDialog(open, () => close(), containerRef);

  if (!open) return null;

  return (
    <div className="tour-backdrop">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        className="tour-sheet"
      >
        <p className="muted tour-step" aria-live="polite">{CLIENT_TOUR_STRINGS.stepOf(index + 1, total)}</p>
        <div className="tour-dots" aria-hidden="true">
          {CLIENT_TOUR_STEPS.map((s, i) => (
            <span key={s.id} className={i === index ? "tour-dot on" : "tour-dot"} />
          ))}
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-body">{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="button secondary" onClick={() => close()}>
            {CLIENT_TOUR_STRINGS.skip}
          </button>
          {last ? (
            <Link className="button" href="/pedir" onClick={(e) => { e.preventDefault(); close("pedir"); }}>
              {CLIENT_TOUR_STRINGS.finish}
            </Link>
          ) : (
            <button type="button" className="button" onClick={() => setIndex((i) => i + 1)}>
              {CLIENT_TOUR_STRINGS.next}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
