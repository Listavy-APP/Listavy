"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { es } from "@/lib/i18n/es";
import { useDialog } from "@/components/useDialog";

/** Mobile-first bottom sheet for the search filters. The children are the server-rendered filter form. */
export function FiltersSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(open, () => setOpen(false), dialogRef);
  // The page behind cannot scroll while the sheet is open. Restored on close and on unmount.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  return (
    <>
      <button className="button secondary filters-btn" type="button" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5L3 5z" /></svg>
        {es.filters.open}
      </button>
      {open ? createPortal(
        // Portaled to body: the sticky header and search topbar cannot stack above the dim.
        <div className="sheet-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div ref={dialogRef} tabIndex={-1} className="sheet" role="dialog" aria-modal="true" aria-label={es.filters.title} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{es.filters.title}</strong>
              <button className="sheet-close" type="button" aria-label={es.filters.close} onClick={() => setOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {children}
            <button className="button" type="button" onClick={() => setOpen(false)}>{es.filters.apply}</button>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
