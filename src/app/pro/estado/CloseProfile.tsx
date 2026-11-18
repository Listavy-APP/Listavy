"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Closes the pro profile. The close-pro-profile Edge Function enforces the rules
 * (open jobs, unreleased money, open disputes, owed recoveries) and returns the message to show.
 * The pro must type the confirmation word. The button stays disabled until the word matches.
 */
export function CloseProfile() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim() === es.proClose.confirmWord;

  async function onClose() {
    if (!matches) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: fnError } = await supabase.functions.invoke("close-pro-profile", { method: "POST" });
      if (fnError) {
        let msg: string = es.proClose.error;
        try {
          const ctx = (fnError as { context?: Response }).context;
          if (ctx) msg = ((await ctx.json()) as { error?: string }).error ?? msg;
        } catch {
          // keep the generic message
        }
        throw new Error(msg);
      }
      router.replace("/cuenta");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.proClose.error);
      setBusy(false);
    }
  }

  return (
    <section className="panel stack delete-warning" aria-labelledby="close-profile-title">
      <h2 id="close-profile-title">{es.proClose.title}</h2>
      <p>{es.proClose.intro}</p>
      <div className="stack">
        <b>{es.proClose.keptTitle}</b>
        <p className="muted">{es.proClose.keptBody}</p>
        <b>{es.proClose.stopsTitle}</b>
        <p className="muted">{es.proClose.stopsBody}</p>
        <p className="muted">{es.proClose.reopenBody}</p>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button type="button" className="button danger" onClick={() => setConfirming(true)}>
        {es.proClose.start}
      </button>

      {confirming ? (
        <div className="sheet-backdrop" onClick={() => !busy && setConfirming(false)}>
          <div
            className="sheet stack"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="close-dialog-title"
            aria-describedby="close-dialog-body"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="close-dialog-title">{es.proClose.dialogTitle}</h2>
            <p id="close-dialog-body">{es.proClose.dialogBody}</p>
            <label className="stack">
              <span>{es.proClose.confirmLabel}</span>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                disabled={busy}
                aria-invalid={typed.length > 0 && !matches}
              />
            </label>
            <button type="button" className="button secondary" onClick={() => setConfirming(false)} disabled={busy} autoFocus>
              {es.proClose.cancel}
            </button>
            <button type="button" className="sheet-action danger" onClick={onClose} disabled={busy || !matches}>
              {busy ? es.proClose.busy : es.proClose.confirm}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
