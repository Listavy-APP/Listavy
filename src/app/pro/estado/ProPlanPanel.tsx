"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { es } from "@/lib/i18n/es";

export function ProPlanPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setError(null);
    setBusy(true);
    const { data, error: fnError } = await createSupabaseBrowserClient().functions.invoke("stripe-pro-plan-checkout", {
      body: {},
    });
    if (fnError || !data?.url) {
      setError(es.proStatus.plan.failed);
      setBusy(false);
      return;
    }
    window.location.href = data.url as string;
  }

  return (
    <section className="panel stack" aria-labelledby="plan-title">
      <h2 id="plan-title">{es.proStatus.plan.title}</h2>
      <p className="muted">{es.proStatus.plan.intro}</p>
      <p className="muted">{es.proStatus.plan.rateFree}</p>
      <p className="muted">{es.proStatus.plan.terms}</p>
      <button className="button" disabled={busy} onClick={buy}>
        {es.proStatus.plan.buy}
      </button>
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}
