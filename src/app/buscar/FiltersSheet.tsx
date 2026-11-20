"use client";

import { useRef, useState, type ReactNode } from "react";
import { es } from "@/lib/i18n/es";
import { useDialog } from "@/components/useDialog";

/** Mobile-first bottom sheet for the search filters. The children are the server-rendered filter form. */
export function FiltersSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(open, () => setOpen(false), dialogRef);
  return (
    <>
      <button className="button secondary filters-btn" type="button" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5L3 5z" /></svg>
        {es.filters.open}
      </button>
      {open ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div ref={dialogRef} tabIndex={-1} className="sheet" role="dialog" aria-modal="true" aria-label={es.filters.title} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{es.filters.title}</strong>
              <button className="link-quiet" type="button" onClick={() => setOpen(false)}>{es.filters.close}</button>
            </div>
            {children}
            <button className="button" type="button" onClick={() => setOpen(false)}>{es.filters.apply}</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
