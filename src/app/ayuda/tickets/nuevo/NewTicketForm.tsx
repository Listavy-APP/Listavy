"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Choice } from "@/components/ui/Choice";
import { createSupportTicket, SUPPORT_CATEGORIES, type SupportCategory } from "@/lib/data/support";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type JobOption = { id: string; trade: string; zone: string; status: string };

/** New ticket. Trabajo points at the dispute flow in plain words, without blocking the ticket. */
export function NewTicketForm({ jobs }: { jobs: JobOption[] }) {
  const router = useRouter();
  const [category, setCategory] = useState<SupportCategory>("cuenta");
  const [jobId, setJobId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    setBusy(true);
    try {
      const id = await createSupportTicket(createSupabaseBrowserClient(), {
        category,
        subject,
        body,
        jobId: jobId || null,
      });
      router.push(`/ayuda/tickets/${id}`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : es.support.failed);
      setBusy(false);
    }
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void send();
      }}
    >
      <Choice
        legend={es.support.category}
        name="ticketCategory"
        value={category}
        options={SUPPORT_CATEGORIES.map((c) => ({ value: c, label: es.support.categories[c] }))}
        onChange={setCategory}
        disabled={busy}
      />
      {category === "trabajo" ? (
        <div className="notice" role="note">
          <p>{es.support.trabajoNotice}</p>
          <Link className="button secondary" href="/trabajos">
            {es.support.goToJobs}
          </Link>
        </div>
      ) : null}
      <label className="field">
        <span>{es.support.job}</span>
        <select value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={busy}>
          <option value="">{es.support.noJob}</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.trade} · {j.zone} · {j.status}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{es.support.subject}</span>
        <input value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} disabled={busy} required />
      </label>
      <label className="field">
        <span>{es.support.body}</span>
        <textarea
          value={body}
          maxLength={2000}
          rows={6}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
          required
          aria-describedby="ticket-body-help"
        />
        <small id="ticket-body-help" className="muted">
          {es.support.bodyHelp} ({body.length}/2000)
        </small>
      </label>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="button" type="submit" disabled={busy || !subject.trim() || !body.trim()}>
        {busy ? es.support.sending : es.support.send}
      </button>
    </form>
  );
}
