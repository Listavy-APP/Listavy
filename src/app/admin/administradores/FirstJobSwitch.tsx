"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type FirstJobState = { enabled: boolean; updated_at: string } | null;

/**
 * Super-admin switch for the first-job commission waiver (migration 0108). The current state comes from the
 * server page. Writes go through admin_set_first_job_free only. The reason is required and is logged to admin_log.
 */
export function FirstJobSwitch({ initial }: { initial: FirstJobState }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!initial) return <p role="alert">{es.firstJobWaiver.loadError}</p>;
  const enabled = initial.enabled;

  async function set(next: boolean) {
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const { error: err } = await createSupabaseBrowserClient().rpc("admin_set_first_job_free", {
        p_enabled: next,
        p_reason: reason.trim(),
      });
      if (err) throw new Error(err.message);
      setReason("");
      setDone(es.firstJobWaiver.saved);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : es.firstJobWaiver.loadError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack" aria-label={es.firstJobWaiver.title}>
      <h2>{es.firstJobWaiver.title}</h2>
      <p className="muted">{es.firstJobWaiver.intro}</p>
      <p>
        <strong>{enabled ? es.firstJobWaiver.on : es.firstJobWaiver.off}</strong>
      </p>
      <label className="field">
        {es.firstJobWaiver.reasonLabel}
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <p className="muted">{es.firstJobWaiver.reasonHint}</p>
      <button className="button" type="button" disabled={busy || reason.trim().length < 10} onClick={() => set(!enabled)}>
        {enabled ? es.firstJobWaiver.toggleOff : es.firstJobWaiver.toggleOn}
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {done ? <p className="ok" role="status">{done}</p> : null}
    </section>
  );
}
