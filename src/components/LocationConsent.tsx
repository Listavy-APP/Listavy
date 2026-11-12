"use client";

import { es } from "@/lib/i18n/es";

/**
 * Location consent. Off by default. Shown on its own screen, never bundled with other consents.
 * The assigned pro sees a shared location only after payment (enforced by the caller and RLS).
 */
export function LocationConsent({
  onChoose,
}: {
  onChoose: (allowed: boolean) => void;
}) {
  return (
    <section className="stack">
      <h2>{es.location.consentTitle}</h2>
      <p>{es.location.consentBody}</p>
      <p className="muted">{es.location.consentPayment}</p>
      <div className="row">
        <button type="button" className="button" onClick={() => onChoose(true)}>
          {es.location.allow}
        </button>
        <button type="button" className="button secondary" onClick={() => onChoose(false)}>
          {es.location.decline}
        </button>
      </div>
    </section>
  );
}
