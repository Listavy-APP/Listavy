"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type TouchEvent } from "react";
import { useDialog } from "@/components/useDialog";
import { CLIENT_TOUR_STEPS, CLIENT_TOUR_STRINGS } from "@/lib/onboarding/clientTour";
import { tourFinishAction } from "@/lib/domain/clientTour";
import { stampClientTour } from "@/lib/data/profiles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Horizontal travel (px) that counts as a swipe, and how much it must beat vertical travel. */
const SWIPE_MIN = 50;

/**
 * First-run client tour (8g). Three steps, skippable at every step (Saltar or Escape).
 * Mode "first" stamps the server flag once on finish or skip. Mode "replay" never touches it.
 * Fails open: a stamp error never blocks the screen. The dialog closes at once.
 * Navigation: buttons and touch swipe (left = next, right = back). No auto-advance.
 */
export function ClientTour({ mode }: { mode: "first" | "replay" }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "back">("next");
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

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

  function go(to: number) {
    if (to < 0 || to >= total || to === index) return;
    setDir(to > index ? "next" : "back");
    setIndex(to);
  }

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  }

  function onTouchEnd(e: TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go(dx < 0 ? index + 1 : index - 1);
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
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="tour-top">
          <div className="tour-progress" aria-hidden="true">
            {CLIENT_TOUR_STEPS.map((s, i) => (
              <span key={s.id} className={i <= index ? "tour-seg on" : "tour-seg"} />
            ))}
          </div>
          <p className="muted tour-step" aria-live="polite">{CLIENT_TOUR_STRINGS.stepOf(index + 1, total)}</p>
          <button type="button" className="tour-skip" onClick={() => close()}>
            {CLIENT_TOUR_STRINGS.skip}
          </button>
        </div>

        {/* Keyed by step so each change replays the slide-in. Reduced motion turns the slide off in CSS. */}
        <div key={step.id} className={`tour-stage ${dir === "next" ? "tour-slide-next" : "tour-slide-back"}`}>
          <div className="tour-content">
            {index === 0 ? (
              <div className="tour-intro">
                <span className="tour-wordmark">{CLIENT_TOUR_STRINGS.introWordmark}</span>
                <p className="tour-intro-line">{CLIENT_TOUR_STRINGS.introLine}</p>
              </div>
            ) : null}
            <div className="tour-panel">
              <Image src={step.image} alt={step.alt} width={480} height={308} sizes="320px" className="tour-photo" />
            </div>
            <p className="tour-kicker">{step.kicker}</p>
            <h2 id="tour-title">{step.title}</h2>
            <p className="tour-subtitle">{step.subtitle}</p>
            <p id="tour-body" className="tour-body">{step.body}</p>
          </div>
        </div>

        <div className="tour-bottom">
          {last ? (
            <Link className="button tour-cta" href="/pedir" onClick={(e) => { e.preventDefault(); close("pedir"); }}>
              {CLIENT_TOUR_STRINGS.finish}
            </Link>
          ) : (
            <button type="button" className="button tour-cta" onClick={() => go(index + 1)}>
              {CLIENT_TOUR_STRINGS.next}
            </button>
          )}
          <p className="tour-footer">{CLIENT_TOUR_STRINGS.footer}</p>
        </div>
      </div>
    </div>
  );
}
