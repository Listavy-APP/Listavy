"use client";

import { useRef, type ReactNode } from "react";
import { HomeIcon } from "./HomeIcons";

/**
 * Date field with a visible calendar button. The button and the field both open the picker.
 * showPicker() needs a user gesture; where it is missing or throws, the native input still works.
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
      <div className={variant === "field" ? "field-date-row" : "date-row"}>
        <button type="button" className="date-icon" onClick={openPicker} aria-label="Abrir calendario">
          <HomeIcon name="calendar" size={20} />
        </button>
        <input ref={ref} id={id} type="date" name={name} defaultValue={defaultValue} onClick={openPicker} />
      </div>
    </div>
  );
}
