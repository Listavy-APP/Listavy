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
    }
  }

  if (!confirming) {
    return (
      <div className="stack">
        <p className="muted">{es.profile.deleteInfo}</p>
        <button type="button" className="secondary" onClick={() => setConfirming(true)}>
          {es.profile.deleteStart}
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <p>{es.profile.deleteConfirm}</p>
      {error ? <p className="error">{error}</p> : null}
      <button type="button" onClick={onDelete} disabled={busy}>
        {busy ? es.profile.deleteBusy : es.profile.deleteConfirmButton}
      </button>
      <button type="button" className="secondary" onClick={() => setConfirming(false)} disabled={busy}>
        {es.profile.deleteCancel}
      </button>
    </div>
  );
}
