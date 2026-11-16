"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { revokeReferral } from "@/lib/data/referrals";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { es } from "@/lib/i18n/es";

/** Manual revocation for fraud. Asks for a reason. The database checks that the caller is an admin. */
export function RevokeReferralButton({ referralId }: { referralId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function revoke() {
    if (reason.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await revokeReferral(createSupabaseBrowserClient(), referralId, reason.trim());
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(es.referral.admin.revokeFailed + (e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p className="muted">{es.referral.admin.revokeDone}</p>;
  // Inline reason field. Native prompt() dialogs do not open in every browser shell.
  if (open) {
    return (
      <div className="stack">
        <label className="field">
          {es.referral.admin.revokePrompt}
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="row">
          <button className="button" type="button" disabled={busy || reason.trim().length < 3} onClick={revoke}>
            {es.referral.admin.revoke}
          </button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>
            {es.adminPending.cancel}
          </button>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>
    );
  }
  return (
    <button className="button" type="button" onClick={() => setOpen(true)}>
      {es.referral.admin.revoke}
    </button>
  );
}
