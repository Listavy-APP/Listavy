"use client";

import { es } from "@/lib/i18n/es";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="stack">
      <h1>{es.common.errorGeneric}</h1>
      <button className="button" type="button" onClick={reset}>
        {es.common.retry}
      </button>
    </section>
  );
}
