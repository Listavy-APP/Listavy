"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { closeSupportTicket, replySupportTicket } from "@/lib/data/support";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Reply and close. Close asks once more inline. No window.confirm. */
export function ThreadReply({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  async function send() {
    setError(null);
    setBusy(true);
    try {
      await replySupportTicket(createSupabaseBrowserClient(), ticketId, body);
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : es.support.replyFailed);
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    setError(null);
    setBusy(true);
    try {
      await closeSupportTicket(createSupabaseBrowserClient(), ticketId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : es.support.replyFailed);
    } finally {
      setBusy(false);
      setConfirmingClose(false);
    }
  }

  return (
    <div className="stack">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && body.trim()) void send();
        }}
      >
        <label className="field">
          <span>{es.support.reply}</span>
          <textarea value={body} maxLength={2000} rows={4} onChange={(e) => setBody(e.target.value)} disabled={busy} />
        </label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="button" type="submit" disabled={busy || !body.trim()}>
          {es.support.replySend}
        </button>
      </form>
      {confirmingClose ? (
        <div className="stack" role="group" aria-label={es.support.close}>
          <p>{es.support.confirmClose}</p>
          <button className="button" type="button" disabled={busy} onClick={close}>
            {es.support.confirmYes}
          </button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => setConfirmingClose(false)}>
            {es.support.confirmNo}
          </button>
        </div>
      ) : (
        <button className="button secondary" type="button" disabled={busy} onClick={() => setConfirmingClose(true)}>
          {es.support.close}
        </button>
      )}
    </div>
  );
}
