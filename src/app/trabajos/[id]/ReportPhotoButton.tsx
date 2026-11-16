"use client";

import { useState } from "react";
import { reportJobPhoto } from "@/lib/data/trust";
import { esTrust } from "@/lib/i18n/trust";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Lets a party report a job photo they can already see. Reports go to the admin queue. */
export function ReportPhotoButton({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) return <p className="muted">{esTrust.photoReport.sent}</p>;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await reportJobPhoto(createSupabaseBrowserClient(), path, reason);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : esTrust.photoReport.alreadyReported);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="button ghost" type="button" onClick={() => setOpen(true)}>
        {esTrust.photoReport.report}
      </button>
    );
  }

  return (
    <div className="stack">
      <h3>{esTrust.photoReport.reportTitle}</h3>
      {error ? <p className="error">{error}</p> : null}
      <label className="field">
        {esTrust.photoReport.reasonLabel}
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button className="button" type="button" disabled={busy || reason.trim().length < 10} onClick={send}>
        {esTrust.photoReport.send}
      </button>
    </div>
  );
}
