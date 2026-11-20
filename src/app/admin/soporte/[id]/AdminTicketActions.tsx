"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminReplyTicket, adminSetTicketStatus, type SupportStatus } from "@/lib/data/support";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Admin reply (moves the ticket to answered) and close or reopen. Close asks once more inline. */
export function AdminTicketActions({ ticketId, status }: { ticketId: string; status: SupportStatus }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  async function reply() {
    setError(null);
    setBusy(true);
    try {
      await adminReplyTicket(createSupabaseBrowserClient(), ticketId, body);
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : es.support.admin.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(next: "open" | "closed") {
    setError(null);
    setBusy(true);
    try {
      await adminSetTicketStatus(createSupabaseBrowserClient(), ticketId, next);
      setConfirmingClose(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : es.support.admin.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {status !== "closed" ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && body.trim()) void reply();
          }}
        >
          <label className="field">
            <span>{es.support.admin.reply}</span>
            <textarea value={body} maxLength={2000} rows={4} onChange={(e) => setBody(e.target.value)} disabled={busy} />
          </label>
          <button className="button" type="submit" disabled={busy || !body.trim()}>
            {es.support.admin.replySend}
          </button>
        </form>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {status === "closed" ? (
        <button className="button secondary" type="button" disabled={busy} onClick={() => setStatus("open")}>
          {es.support.admin.reopen}
        </button>
      ) : confirmingClose ? (
        <div className="stack" role="group" aria-label={es.support.admin.close}>
          <p>{es.support.confirmClose}</p>
          <button className="button" type="button" disabled={busy} onClick={() => setStatus("closed")}>
            {es.support.confirmYes}
          </button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => setConfirmingClose(false)}>
            {es.support.confirmNo}
          </button>
        </div>
      ) : (
        <button className="button secondary" type="button" disabled={busy} onClick={() => setConfirmingClose(true)}>
          {es.support.admin.close}
        </button>
      )}
    </div>
  );
}
