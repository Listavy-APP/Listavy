"use client";

import { es } from "@/lib/i18n/es";

/** Opens the browser print dialog. The print stylesheet keeps only the statement. Save as PDF from there. */
export function PrintButton() {
  return (
    <button className="button secondary tap no-print" type="button" onClick={() => window.print()}>
      {es.proStatement.print}
    </button>
  );
}
