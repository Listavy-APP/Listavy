"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Step shell: sticky progress header under the app header, and a fixed action bar at the bottom.
 * Presentation only. The parent owns the step index, validation and submit.
 */
export function WizardHeader({ step, total, title }: { step: number; total: number; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  // Sit below the sticky app header. Its height has no token, so measure it and follow resizes.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".app-header");
    if (!header) return;
    const update = () => setTop(header.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
  const pct = Math.round(((step - 1) / total) * 100);
  return (
    <div ref={ref} className="wizard-head" style={{ top }}>
      <div
        className="wizard-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`Paso ${step} de ${total}`}
      >
        <span className="wizard-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="wizard-step" aria-live="polite">
        Paso {step} de {total} · {title}
      </p>
    </div>
  );
}

export function WizardBar({
  showBack,
  backLabel,
  onBack,
  children,
}: {
  showBack: boolean;
  backLabel: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="wizard-bar">
      <div className="wizard-bar-inner">
        {showBack ? (
          <button type="button" className="wizard-back" onClick={onBack}>
            {backLabel}
          </button>
        ) : (
          <span />
        )}
        {children}
      </div>
    </div>
  );
}
