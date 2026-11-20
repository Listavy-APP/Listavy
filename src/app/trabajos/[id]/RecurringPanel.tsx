"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Choice } from "@/components/ui/Choice";
import { createRecurringBooking, type RecurringRow } from "@/lib/data/recurring";
import {
  RECURRING_FREQUENCIES,
  anchorProblem,
  defaultAnchor,
  frequencyLine,
  type RecurringFrequency,
} from "@/lib/domain/recurring";
import { santoDomingoToday } from "@/lib/domain/schedule";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const WINDOWS = ["morning", "afternoon", "evening"] as const;

/** Homeowner turns a completed job into a series. Shown only on completed jobs. No charge is created. */
export function RecurringPanel({
  jobId,
  proName,
  jobWindow,
  existing,
}: {
  jobId: string;
  proName: string | null;
  jobWindow: string | null;
  existing: RecurringRow | null;
}) {
  const router = useRouter();
  const today = santoDomingoToday();
  const [frequency, setFrequency] = useState<RecurringFrequency>("weekly");
  const [anchor, setAnchor] = useState<number>(() => defaultAnchor("weekly", today));
  const [win, setWin] = useState<(typeof WINDOWS)[number]>(
    (WINDOWS as readonly string[]).includes(jobWindow ?? "") ? (jobWindow as (typeof WINDOWS)[number]) : "morning",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (existing) {
    return (
      <section className="panel stack" aria-label={es.recurring.title}>
        <h2>{es.recurring.title}</h2>
        <p className="muted">
          {frequencyLine(existing.frequency, existing.anchor)} · {es.recurring.statusLabel[existing.status]}
        </p>
        <Link className="button secondary" href="/cuenta/recurrentes">
          {es.recurring.listLink}
        </Link>
      </section>
    );
  }

  function changeFrequency(next: RecurringFrequency) {
    setFrequency(next);
    // Weekday and day-of-month use different numbering. Reset when the type changes.
    const crossesType = (next === "monthly") !== (frequency === "monthly");
    if (crossesType) setAnchor(defaultAnchor(next, today));
  }

  async function create() {
    setError(null);
    setDone(false);
    if (anchorProblem(frequency, anchor)) {
      setError(es.recurring.createFailed);
      return;
    }
    setBusy(true);
    try {
      await createRecurringBooking(createSupabaseBrowserClient(), { sourceJobId: jobId, frequency, anchor, window: win });
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : es.recurring.createFailed);
    } finally {
      setBusy(false);
    }
  }

  const monthDays = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <section className="panel stack" aria-label={es.recurring.startTitle}>
      <h2>{es.recurring.startTitle}</h2>
      <p className="muted">
        {es.recurring.startHelp}
        {proName ? ` ${es.recurring.professional}: ${proName}.` : ""}
      </p>
      <Choice
        legend={es.recurring.frequency}
        name="recurringFrequency"
        value={frequency}
        options={RECURRING_FREQUENCIES.map((f) => ({ value: f, label: es.recurring.frequencies[f] }))}
        onChange={changeFrequency}
        disabled={busy}
      />
      {frequency === "monthly" ? (
        <label className="field">
          <span>{es.recurring.monthDay}</span>
          <select value={anchor} onChange={(e) => setAnchor(Number(e.target.value))} disabled={busy}>
            {monthDays.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <small className="muted">{es.recurring.monthDayHelp}</small>
        </label>
      ) : (
        <label className="field">
          <span>{es.recurring.weekday}</span>
          <select value={anchor} onChange={(e) => setAnchor(Number(e.target.value))} disabled={busy}>
            {es.recurring.weekdays.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      <Choice
        legend={es.recurring.window}
        name="recurringWindow"
        value={win}
        options={WINDOWS.map((w) => ({ value: w, label: es.schedule.windows[w] }))}
        onChange={setWin}
        disabled={busy}
      />
      <p className="muted">{frequencyLine(frequency, anchor)}</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {done ? <p className="ok" role="status">{es.recurring.created}</p> : null}
      <button className="button" type="button" disabled={busy} onClick={create}>
        {busy ? es.recurring.creating : es.recurring.create}
      </button>
    </section>
  );
}

