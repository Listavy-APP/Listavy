"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { es } from "@/lib/i18n/es";

/** Approve or reject one pending pro. Both go through admin_review_pro, which writes the Bitácora. */
export function PendingProActions({ proId }: { proId: string }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(status: "approved" | "rejected") {
    setBusy(true);
    setError(null);
    const args =
      status === "approved"
        ? { p_pro: proId, p_status: "approved" }
        : { p_pro: proId, p_status: "rejected", p_reason: reason.trim() };
    const { error: err } = await createSupabaseBrowserClient().rpc("admin_review_pro", args);
    setBusy(false);
    if (err) return setError(err.message || es.adminPending.fail);
    router.refresh();
  }

  if (rejecting) {
    return (
      <div className="stack">
        <label className="stack">
          <span>{es.adminPending.rejectReason}</span>
          <textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} rows={3} />
        </label>
        <div className="row">
          <button className="button" type="button" disabled={busy || reason.trim().length === 0} onClick={() => decide("rejected")}>
            {es.adminPending.rejectConfirm}
          </button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => setRejecting(false)}>
            {es.adminPending.cancel}
          </button>
        </div>
        {error ? <p className="muted">{error}</p> : null}
      </div>
    );
  }

  // Inline confirmation. Native confirm() dialogs do not open in every browser shell.
  if (confirming) {
    return (
      <div className="stack">
        <p>{es.adminPending.confirmApprove}</p>
        <div className="row">
          <button className="button" type="button" disabled={busy} onClick={() => decide("approved")}>
            {es.adminPending.approve}
          </button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => setConfirming(false)}>
            {es.adminPending.cancel}
          </button>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row">
        <button className="button" type="button" disabled={busy} onClick={() => setConfirming(true)}>
          {es.adminPending.approve}
        </button>
        <button className="button secondary" type="button" disabled={busy} onClick={() => setRejecting(true)}>
          {es.adminPending.reject}
        </button>
      </div>
      {error ? <p className="muted">{error}</p> : null}
    </div>
  );
}
