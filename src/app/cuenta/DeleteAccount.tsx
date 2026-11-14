"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Two-step confirmation. The delete-account Edge Function enforces the rules
 * (open jobs, held payments, open disputes block deletion) and the client shows its message.
 */
export function DeleteAccount() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setError(null);
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: fnError } = await supabase.functions.invoke("delete-account", { method: "POST" });
      if (fnError) {
        let msg: string = es.profile.deleteError;
        try {
          const ctx = (fnError as { context?: Response }).context;
          if (ctx) msg = ((await ctx.json()) as { error?: string }).error ?? msg;
        } catch {
          // keep the generic message
        }
        throw new Error(msg);
      }
      await supabase.auth.signOut();
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.profile.deleteError);
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="stack">
      <div className="panel stack delete-warning" role="note">
        <b>{es.profile.deleteWarningTitle}</b>
        <p>{es.profile.deleteWarningBody}</p>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button type="button" className="button danger" onClick={() => setConfirming(true)}>
        {es.profile.deleteStart}
      </button>

      {confirming ? (
        <div className="sheet-backdrop" onClick={() => !busy && setConfirming(false)}>
          <div
            className="sheet stack"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-body"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-dialog-title">{es.profile.deleteDialogTitle}</h2>
            <p id="delete-dialog-body">{es.profile.deleteDialogBody}</p>
            <button type="button" className="button secondary" onClick={() => setConfirming(false)} disabled={busy} autoFocus>
              {es.profile.deleteCancel}
            </button>
            <button type="button" className="sheet-action danger" onClick={onDelete} disabled={busy}>
              {busy ? es.profile.deleteBusy : es.profile.deleteDialogConfirm}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
