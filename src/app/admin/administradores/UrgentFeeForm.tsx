"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Super-admin editor for the urgent fee (0117). Writes go through admin_set_urgent_fee only.
 * The reason is required and is logged to admin_log. The database bounds the amount.
 */
export function UrgentFeeForm({ initial }: { initial: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (initial === null) return <p role="alert">{es.urgent.adminFailed}</p>;

  async function save() {
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const { error: err } = await createSupabaseBrowserClient().rpc("admin_set_urgent_fee", {
        p_dop: Number(value),
        p_reason: reason.trim(),
      });
      if (err) throw new Error(err.message);
      setReason("");
      setDone(es.urgent.adminSaved);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : es.urgent.adminFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack" aria-label={es.urgent.adminTitle}>
      <h2>{es.urgent.adminTitle}</h2>
      <p className="muted">{es.urgent.adminHint}</p>
      <label className="field">
        <span>RD$</span>
        <input type="number" inputMode="numeric" min={100} max={5000} step={1} value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} />
      </label>
      <label className="field">
        {es.urgent.adminReason}
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
      </label>
      <button
        className="button"
        type="button"
        disabled={busy || reason.trim().length < 10 || !/^\d+$/.test(value)}
        onClick={save}
      >
        {es.urgent.adminTitle}
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {done ? <p className="ok" role="status">{done}</p> : null}
    </section>
  );
}
