"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { declineInvite, submitQuote } from "@/lib/data/jobs";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Job = {
  id: string;
  trade: string;
  zone: string;
  description: string;
  status: string;
  job_type: "repair" | "diagnostic";
  voice_path: string | null;
};

export type Quote = {
  id: string;
  status: string;
  amount_dop: number | null;
  invited_at: string;
  valid_until: string | null;
  job: Job | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function InviteCard({ quote }: { quote: Quote }) {
  const router = useRouter();
  const job = quote.job;
  const [amount, setAmount] = useState("");
  const [includes, setIncludes] = useState("");
  const [excludes, setExcludes] = useState("");
  const [materials, setMaterials] = useState<"yes" | "no" | "">("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!job) return null;

  const deadline = new Date(new Date(quote.invited_at).getTime() + DAY_MS);
  const expired = quote.status === "invited" && deadline.getTime() < Date.now();
  const isDiagnostic = job.job_type === "diagnostic";

  async function onQuote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (materials === "") return setError(es.jobs.materialsRequired);
    setBusy(true);
    try {
      await submitQuote(createSupabaseBrowserClient(), quote.id, {
        amountDop: Number(amount),
        includes: includes.trim(),
        excludes: excludes.trim(),
        materialsIncluded: materials === "yes",
        windowStart: new Date(start).toISOString(),
        windowEnd: new Date(end).toISOString(),
        durationHours: Number(duration),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.jobs.genericError);
      setBusy(false);
    }
  }

  async function onDecline() {
    setBusy(true);
    try {
      await declineInvite(createSupabaseBrowserClient(), quote.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.jobs.genericError);
      setBusy(false);
    }
  }

  return (
    <article className="card stack">
      <strong>
        {es.trades[job.trade as keyof typeof es.trades] ?? job.trade} · {job.zone}
        {isDiagnostic ? ` · ${es.jobs.typeDiagnostic}` : ""}
      </strong>
      <p>{job.description}</p>
      <p className="muted">
        {es.jobs.oneOfThree}
      </p>

      {quote.status === "invited" && !expired && (
        <form className="stack" onSubmit={onQuote}>
          <p className="muted">
            {es.jobs.respondBy(deadline.toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" }))}
          </p>
          <label className="field">
            <span>{isDiagnostic ? es.jobs.diagnosticPriceLabel : es.jobs.amountLabel}</span>
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} required />
          </label>
          <label className="field">
            <span>{es.jobs.includesLabel}</span>
            <textarea rows={3} value={includes} onChange={(e) => setIncludes(e.target.value)} required />
          </label>
          <label className="field">
            <span>{es.jobs.excludesLabel}</span>
            <textarea rows={2} value={excludes} onChange={(e) => setExcludes(e.target.value)} />
          </label>
          <fieldset className="field">
            <legend>{es.jobs.materialsLabel}</legend>
            <label>
              <input type="radio" name={`mat-${quote.id}`} checked={materials === "yes"} onChange={() => setMaterials("yes")} />{" "}
              {es.jobs.materialsYes}
            </label>
            <label>
              <input type="radio" name={`mat-${quote.id}`} checked={materials === "no"} onChange={() => setMaterials("no")} />{" "}
              {es.jobs.materialsNo}
            </label>
          </fieldset>
          <label className="field">
            <span>{es.jobs.startLabel}</span>
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label className="field">
            <span>{es.jobs.endLabel}</span>
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
          <label className="field">
            <span>{es.jobs.durationLabel}</span>
            <input inputMode="decimal" value={duration} onChange={(e) => setDuration(e.target.value)} required />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="button" type="submit" disabled={busy}>
            {busy ? es.jobs.sending : es.jobs.sendQuote}
          </button>
          <button className="button secondary" type="button" onClick={onDecline} disabled={busy}>
            {es.jobs.decline}
          </button>
        </form>
      )}

      {quote.status === "invited" && expired && <p className="muted">{es.jobs.expiredInvite}</p>}
      {quote.status === "sent" && (
        <p className="ok">
          {es.jobs.quoteSent(quote.amount_dop ?? 0)}
          {quote.valid_until
            ? ` · ${es.jobs.validUntil(new Date(quote.valid_until).toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" }))}`
            : ""}
        </p>
      )}
      {quote.status === "accepted" && job.status !== "completed" && (
        <Link className="button" href={`/trabajos/${job.id}`}>
          {es.jobs.openJob}
        </Link>
      )}
      {quote.status === "rejected" && <p className="muted">{es.jobs.notChosen}</p>}
      {quote.status === "declined" && <p className="muted">{es.jobs.declinedLabel}</p>}
      {quote.status === "expired" && <p className="muted">{es.jobs.expiredInvite}</p>}
    </article>
  );
}
