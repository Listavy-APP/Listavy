"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { suspendClient, unsuspendClient } from "@/lib/data/trust";
import { esTrust } from "@/lib/i18n/trust";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Suspend or reactivate one client. Each action needs a written reason (audit log). */
export function ClientSuspensionActions({ clientId, suspended }: { clientId: string; suspended: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      if (suspended) await unsuspendClient(supabase, clientId, reason);
      else await suspendClient(supabase, clientId, reason);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error ? <p className="error">{error}</p> : null}
      <label className="field">
        {esTrust.adminClients.reasonLabel}
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button
        className={suspended ? "button secondary" : "button danger"}
        type="button"
        disabled={busy || reason.trim().length < 10}
        onClick={act}
      >
        {suspended ? esTrust.adminClients.unsuspend : esTrust.adminClients.suspend}
      </button>
    </div>
  );
}
