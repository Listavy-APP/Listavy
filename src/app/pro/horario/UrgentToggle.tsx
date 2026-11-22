"use client";

import { useState } from "react";
import { Switch } from "@/components/Switch";
import { es } from "@/lib/i18n/es";
import { setMyUrgentAvailable } from "@/lib/data/pros";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { URGENT_FEE_DOP_DEFAULT } from "@/lib/domain/urgent";

/** Opt-in for urgent jobs (0117). Default off. Saved at once through pro_set_urgent_available. */
export function UrgentToggle({ initial, feeDop }: { initial: boolean; feeDop: number | null }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fee = feeDop ?? URGENT_FEE_DOP_DEFAULT;

  async function change(next: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      await setMyUrgentAvailable(createSupabaseBrowserClient(), next);
      setOn(next);
      setMessage(es.urgent.proSaved);
    } catch {
      setMessage(es.urgent.proFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack" aria-labelledby="urgent-toggle-title">
      <div className="row">
        <Switch checked={on} onChange={change} label={es.urgent.proToggle} disabled={busy} />
        <h2 id="urgent-toggle-title">{es.urgent.proToggle}</h2>
      </div>
      <p className="muted">{es.urgent.proExplainer(fee)}</p>
      <p role="status" className="muted">{message}</p>
    </section>
  );
}
