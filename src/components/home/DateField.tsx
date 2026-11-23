"use client";

import { useRef, type ReactNode } from "react";
import { HomeIcon } from "./HomeIcons";

/**
 * Date field built on the native <input type="date">, which is the tap surface. The browser keeps its
 * own picker, placeholder and tap behavior. The calendar icon is decorative and does not take taps.
 * showPicker() on the input's own click is an enhancement only: if it is absent or throws, the native
 * control still works. Sizing is fixed per context by CSS (.search-pill on home, .field on /buscar).
 */
export function DateField({
  id,
  name,
  label,
  defaultValue,
  variant = "pill",
}: {
  id: string;
  name: string;
  label: ReactNode;
  defaultValue?: string;
  /** "pill": home search pill. "field": the /buscar filters, which use the shared field classes. */
  variant?: "pill" | "field";
}) {
  const ref = useRef<HTMLInputElement>(null);

  function openPicker() {
    const el = ref.current;
    if (!el || typeof el.showPicker !== "function") return;
    try {
      el.showPicker();
    } catch {
      // Not allowed in this context (no user gesture, or unsupported). The native control still works.
    }
  }

  return (
    <div className={variant === "field" ? "field" : "pill-field"}>
      <label htmlFor={id}>{label}</label>
      <div className="date-shell">
        <input
          ref={ref}
          id={id}
          className="date-input"
          type="date"
          name={name}
          defaultValue={defaultValue}
          onClick={openPicker}
        />
        <span className="date-shell-icon" aria-hidden="true">
          <HomeIcon name="calendar" size={20} />
        </span>
      </div>
    </div>
  );
}
