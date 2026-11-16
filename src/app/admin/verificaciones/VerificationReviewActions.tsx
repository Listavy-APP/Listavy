"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { reviewVerification } from "@/lib/data/verification";
import { esVerification as t } from "@/lib/i18n/verification";

/** Approve (with dates from the document) or reject (with a reason). Goes through admin_review_verification. */
export function VerificationReviewActions({ id, needsIssue, needsExpiry }: { id: string; needsIssue: boolean; needsExpiry: boolean }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(input: Parameters<typeof reviewVerification>[1]) {
    setBusy(true);
    setError(null);
    try {
      await reviewVerification(createSupabaseBrowserClient(), input);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t.admin.fail);
    } finally {
      setBusy(false);
    }
  }

  if (rejecting) {
    return (
      <div className="stack">
        <label className="stack">
          <span>{t.admin.rejectReason}</span>
          <textarea value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="row">
          <button className="button" type="button" disabled={busy || !reason.trim()} onClick={() => run({ id, decision: "rejected", reason: reason.trim() })}>
            {t.admin.rejectConfirm}
          </button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => setRejecting(false)}>
            {t.admin.cancel}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="stack">
      {needsIssue ? (
        <label className="field"><span>{t.admin.issueDate}</span><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
      ) : null}
      {needsExpiry ? (
        <label className="field"><span>{t.admin.expiryDate}</span><input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label>
      ) : null}
      <div className="row">
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(t.admin.confirmApprove)) {
              run({ id, decision: "approved", issueDate: issueDate || null, expiresAt: expiresAt || null });
            }
          }}
        >
          {t.admin.approve}
        </button>
        <button className="button secondary" type="button" disabled={busy} onClick={() => setRejecting(true)}>
          {t.admin.reject}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
