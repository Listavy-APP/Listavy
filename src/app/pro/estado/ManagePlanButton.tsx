"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { es } from "@/lib/i18n/es";

export function ManagePlanButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function manage() {
    setError(null);
    setBusy(true);
    const { data, error: fnError } = await createSupabaseBrowserClient().functions.invoke("stripe-pro-portal", {
      body: {},
    });
    if (fnError || !data?.url) {
      setError(es.proStatus.plan.manageFailed);
      setBusy(false);
      return;
    }
    window.location.href = data.url as string;
  }

  return (
    <div className="stack">
      <button className="button" disabled={busy} onClick={manage}>
        {es.proStatus.plan.manage}
      </button>
      <p className="muted">{es.proStatus.plan.manageHelp}</p>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
