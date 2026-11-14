"use client";

import Link from "next/link";
import { useState } from "react";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const REASONS = ["no_show", "bad_quality", "unsafe", "fraud", "inappropriate", "other"] as const;
type Reason = (typeof REASONS)[number];

/**
 * "Reportar" on a pro profile (UI phase §7, item 9). Writes pro_reports under owner-only RLS.
 * One report per reporter per pro: a repeat shows "already reported".
 */
export function ReportProButton({ userId, proId, next }: { userId: string | null; proId: string; next: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>("bad_quality");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!userId) {
    return (
      <p className="muted">
        <Link href={`/login?next=${encodeURIComponent(next)}`}>{es.report.signIn}</Link>
      </p>
    );
  }
  if (done) return <p className="muted">{es.report.sent}</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || busy) return;
    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const trimmed = details.trim();
    const { error } = await supabase.from("pro_reports").insert({
      reporter_id: userId,
      pro_id: proId,
      reason,
      details: trimmed.length > 0 ? trimmed : null,
    });
    setBusy(false);
    if (!error) {
      setDone(true);
      return;
    }
    if (error.code === "23505") setMessage(es.report.duplicate);
    else if (error.code === "42501") setMessage(es.report.selfReport);
    else setMessage(es.report.failed);
  }

  if (!open) {
    return (
      <button className="button secondary" type="button" onClick={() => setOpen(true)}>
        {es.report.button}
      </button>
    );
  }

  return (
    <form className="stack" onSubmit={submit}>
      <h2>{es.report.title}</h2>
      <p className="muted">{es.report.intro}</p>
      <label>
        {es.report.reasonLabel}
        <select value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {es.report.reasons[r]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {es.report.detailsLabel}
        <textarea value={details} maxLength={500} onChange={(e) => setDetails(e.target.value)} rows={4} />
        <span className="muted">{es.report.detailsHint}</span>
      </label>
      {message ? <p role="alert">{message}</p> : null}
      <button className="button" type="submit" disabled={busy}>
        {es.report.submit}
      </button>
      <button className="button secondary" type="button" onClick={() => setOpen(false)} disabled={busy}>
        {es.report.cancel}
      </button>
    </form>
  );
}
