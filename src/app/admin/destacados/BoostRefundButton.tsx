"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { es } from "@/lib/i18n/es";

/** Admin refund for one boost. The server computes the amount; the browser only shows it and confirms. */
export function BoostRefundButton({ boostId, amountLabel }: { boostId: string; amountLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function refund() {
    setBusy(true);
    setError(null);
    const { data, error: fnError } = await createSupabaseBrowserClient().functions.invoke("process-boost-refund", {
      body: { boost_id: boostId },
    });
    if (fnError || !data?.result) {
      setError(es.admin.boosts.refundFailed);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  // Inline confirmation. Native confirm() dialogs do not open in every browser shell.
  if (confirming) {
    return (
      <div className="stack">
        <p>{es.admin.boosts.refundConfirm(amountLabel)}</p>
        <div className="row">
          <button type="button" className="button" disabled={busy} onClick={refund}>
            {es.admin.boosts.refundButton(amountLabel)}
          </button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirming(false)}>
            {es.adminPending.cancel}
          </button>
        </div>
        {error ? <p role="alert" className="error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="stack">
      <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirming(true)}>
        {es.admin.boosts.refundButton(amountLabel)}
      </button>
      {error ? <p role="alert" className="error">{error}</p> : null}
    </div>
  );
}
