"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { es } from "@/lib/i18n/es";

const OPTIONS = [
  { days: 7, price: "RD$500" },
  { days: 30, price: "RD$1,500" },
] as const;

export function BoostPanel() {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(days: number) {
    setError(null);
    setBusy(days);
    const { data, error: fnError } = await createSupabaseBrowserClient().functions.invoke("stripe-boost-checkout", {
      body: { duration_days: days },
    });
    if (fnError || !data?.url) {
      setError(es.proStatus.boost.failed);
      setBusy(null);
      return;
    }
    window.location.href = data.url as string;
  }

  return (
    <section className="panel stack" aria-labelledby="boost-title">
      <h2 id="boost-title">{es.proStatus.boost.title}</h2>
      <p className="muted">{es.proStatus.boost.intro}</p>
      {OPTIONS.map((o) => (
        <button key={o.days} className="button" disabled={busy !== null} onClick={() => buy(o.days)}>
          {es.proStatus.boost.option(o.days, o.price)}
        </button>
      ))}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}
