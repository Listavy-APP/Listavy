"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setRecurringStatus, type RecurringRow } from "@/lib/data/recurring";
import { frequencyLine } from "@/lib/domain/recurring";
import { formatScheduleDate } from "@/lib/domain/schedule";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Action = "pause" | "resume" | "cancel";
type Pending = { id: string; action: Action } | null;

/** Pausar, Reanudar and Cancelar. Each pause and cancel asks once more inline. No window.confirm. */
export function RecurringList({ rows }: { rows: RecurringRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, action: Action) {
    setError(null);
    setBusyId(id);
    try {
      await setRecurringStatus(createSupabaseBrowserClient(), id, action);
      setPending(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : es.recurring.actionFailed);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="stack">
      {error ? <p className="error" role="alert">{error}</p> : null}
      {rows.map((row) => {
        const trade = (es.trades as Record<string, string>)[row.trade] ?? row.trade;
        const isPending = pending?.id === row.id ? pending.action : null;
        const busy = busyId === row.id;
        return (
          <article key={row.id} className="panel stack">
            <h2>{trade}</h2>
            <dl className="stack">
              <div>
                <dt className="muted">{es.recurring.professional}</dt>
                <dd>{row.pro_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="muted">{es.recurring.frequency}</dt>
                <dd>
                  {frequencyLine(row.frequency, row.anchor)} · {es.schedule.windowShort[row.scheduled_window]}
                </dd>
              </div>
              {row.status === "active" ? (
                <div>
                  <dt className="muted">{es.recurring.nextDate}</dt>
                  <dd>{formatScheduleDate(row.next_due_date)}</dd>
                </div>
              ) : null}
            </dl>
            <p className="muted">
              <span className="status-pill">{es.recurring.statusLabel[row.status]}</span>{" "}
              {row.status === "paused" && row.paused_reason ? es.recurring.pausedReason[row.paused_reason] : null}
            </p>
            <p className="muted">{es.recurring.occurrences(row.occurrences)}</p>

            {row.status === "cancelled" ? null : isPending ? (
              <div className="stack" role="group" aria-label={es.recurring.confirmYes}>
                <p>{isPending === "pause" ? es.recurring.confirmPause : es.recurring.confirmCancel}</p>
                <button className="button" type="button" disabled={busy} onClick={() => run(row.id, isPending)}>
                  {es.recurring.confirmYes}
                </button>
                <button className="button secondary" type="button" disabled={busy} onClick={() => setPending(null)}>
                  {es.recurring.confirmNo}
                </button>
              </div>
            ) : (
              <div className="stack">
                {row.status === "active" ? (
                  <button className="button secondary" type="button" disabled={busy} onClick={() => setPending({ id: row.id, action: "pause" })}>
                    {es.recurring.pause}
                  </button>
                ) : (
                  <button className="button secondary" type="button" disabled={busy} onClick={() => run(row.id, "resume")}>
                    {es.recurring.resume}
                  </button>
                )}
                <button className="button secondary" type="button" disabled={busy} onClick={() => setPending({ id: row.id, action: "cancel" })}>
                  {es.recurring.cancel}
                </button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
