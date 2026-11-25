"use client";

import Link from "next/link";
import { useRef, useState, type TouchEvent } from "react";
import { HomeIcon, type HomeIconName } from "@/components/home/HomeIcons";
import { es } from "@/lib/i18n/es";

const ICONS: HomeIconName[] = ["notebook-pen", "handshake", "party-popper"];
/** Horizontal travel (px) that counts as a swipe, and how much it must beat vertical travel. */
const SWIPE_MIN = 50;

/**
 * "Cómo funciona" as a three-step carousel. Buttons and touch swipe (left = next, right = back).
 * No auto-advance. Each step is a real region, so a screen reader hears "Paso X de 3".
 */
export function HowCarousel() {
  const steps = es.discover.carouselSteps;
  const total = steps.length;
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "back">("next");
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const step = steps[index];
  const last = index === total - 1;

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

  return (
    <div className="how-carousel">
      <div className="how-progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1} aria-label={`${es.discover.carouselStepOf} ${index + 1} de ${total}`}>
        {steps.map((_, i) => (
          <span key={i} className={i <= index ? "how-seg on" : "how-seg"} />
        ))}
      </div>

      <section
        key={index}
        className={`how-card ${dir === "next" ? "how-slide-next" : "how-slide-back"}`}
        aria-roledescription="slide"
        aria-label={`${es.discover.carouselStepOf} ${index + 1} de ${total}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="how-panel" aria-hidden="true">
          <HomeIcon name={ICONS[index]} size={72} />
        </div>
        <p className="how-kicker">{step.kicker}</p>
        <h3>{step.title}</h3>
        <p className="how-subtitle">{step.subtitle}</p>
        <p className="how-body">{step.body}</p>
      </section>

      <div className="how-nav">
        {index > 0 ? (
          <button type="button" className="how-back" onClick={() => go(index - 1)}>
            {es.discover.carouselBack}
          </button>
        ) : (
          <span />
        )}
        {last ? (
          <Link className="button how-next" href="/pedir">{es.discover.carouselStart}</Link>
        ) : (
          <button type="button" className="button how-next" onClick={() => go(index + 1)}>
            {es.discover.carouselNext}
          </button>
        )}
      </div>

      {!last ? (
        <button type="button" className="how-skip" onClick={() => go(total - 1)}>
          {es.discover.carouselSkip}
        </button>
      ) : null}
    </div>
  );
}
