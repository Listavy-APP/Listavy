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

  async function refund() {
    if (!window.confirm(es.admin.boosts.refundConfirm(amountLabel))) return;
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

  return (
    <div className="stack">
      <button type="button" className="button secondary" disabled={busy} onClick={refund}>
        {es.admin.boosts.refundButton(amountLabel)}
      </button>
      {error ? <p role="alert" className="error">{error}</p> : null}
    </div>
  );
}
