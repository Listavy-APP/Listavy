"use client";

import { useRef, type ReactNode } from "react";
import { HomeIcon } from "./HomeIcons";

/**
 * Date field: one bordered shell with a calendar icon inside, and a borderless date input.
 * Tapping the shell (icon or input area) opens the picker. showPicker() needs a user gesture; where it
 * is missing or throws, the native input still works. The native picker indicator is hidden in CSS.
 * Sizing matches the sibling fields in each context (.search-pill on home, .field on /buscar).
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
      // Not allowed in this context. The user can still use the native control.
    }
  }

  return (
    <div className={variant === "field" ? "field" : "pill-field"}>
      <label htmlFor={id}>{label}</label>
      <div className="date-shell" onClick={openPicker}>
        <span className="date-shell-icon" aria-hidden="true">
          <HomeIcon name="calendar" size={20} />
        </span>
        <input ref={ref} id={id} className="date-input" type="date" name={name} defaultValue={defaultValue} />
      </div>
    </div>
  );
}
