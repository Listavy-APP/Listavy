"use client";

import { useState, type ReactNode } from "react";
import { es } from "@/lib/i18n/es";

/** Mobile-first bottom sheet for the search filters. The children are the server-rendered filter form. */
export function FiltersSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="button secondary" type="button" aria-expanded={open} onClick={() => setOpen(true)}>
        {es.filters.open}
      </button>
      {open ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={es.filters.title} onClick={(e) => e.stopPropagation()}>
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
