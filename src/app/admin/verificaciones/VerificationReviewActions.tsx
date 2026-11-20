"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { reviewVerification } from "@/lib/data/verification";
import { esVerification as t } from "@/lib/i18n/verification";

/** Approve (with dates from the document) or reject (with a reason). Goes through admin_review_verification. */
export function VerificationReviewActions({
  id,
  needsIssue,
  needsExpiry,
  isCompany,
}: {
  id: string;
  needsIssue: boolean;
  needsExpiry: boolean;
  isCompany: boolean;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [estado, setEstado] = useState("");
  const [rmNumber, setRmNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Inline two-step confirm. Native window.confirm can be suppressed by the browser, which made Approve do nothing.
  function approve() {
    setError(null);
    if (needsIssue && !issueDate) return setError(t.form.missingDate);
    if (needsExpiry && !expiresAt) return setError(t.form.missingDate);
    const details: Record<string, string> = {};
    if (estado.trim()) details.estado = estado.trim();
    if (rmNumber.trim()) details.rm_number = rmNumber.trim();
    run({ id, decision: "approved", issueDate: issueDate || null, expiresAt: expiresAt || null, details });
  }

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
        {error ? <p className="error" role="alert">{error}</p> : null}
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
      {isCompany ? (
        <>
          <label className="field"><span>{t.admin.dgiiEstado}</span><input type="text" maxLength={40} value={estado} onChange={(e) => setEstado(e.target.value)} /></label>
          <label className="field"><span>{t.admin.rmNumber}</span><input type="text" maxLength={40} value={rmNumber} onChange={(e) => setRmNumber(e.target.value)} /></label>
        </>
      ) : null}
      {confirming ? (
        <div className="stack">
          <p>{t.admin.confirmApprove}</p>
          <div className="row">
            <button className="button" type="button" disabled={busy} onClick={approve}>
              {t.admin.approveConfirm}
            </button>
            <button className="button secondary" type="button" disabled={busy} onClick={() => setConfirming(false)}>
              {t.admin.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="button" type="button" disabled={busy} onClick={() => setConfirming(true)}>
            {t.admin.approve}
          </button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => setRejecting(true)}>
            {t.admin.reject}
          </button>
        </div>
      )}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
