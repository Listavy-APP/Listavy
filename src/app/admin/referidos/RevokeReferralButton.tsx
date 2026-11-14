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

  async function revoke() {
    const reason = window.prompt(es.referral.admin.revokePrompt);
    if (!reason || reason.trim().length < 3) return;
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
  return (
    <>
      <button className="button" type="button" disabled={busy} onClick={revoke}>
        {es.referral.admin.revoke}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </>
  );
}
