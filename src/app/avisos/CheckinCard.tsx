"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { answerCheckin, markCheckinRead, type CheckinAnswer, type JobCheckin } from "@/lib/data/jobNotifications";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const OPTIONS: Record<JobCheckin["kind"], { value: CheckinAnswer; label: string }[]> = {
  arrival: [
    { value: "yes", label: es.checkins.arrivedYes },
    { value: "no", label: es.checkins.arrivedNo },
  ],
  midjob: [
    { value: "ok", label: es.checkins.midOk },
    { value: "problem", label: es.checkins.problem },
  ],
  overrun: [
    { value: "running", label: es.checkins.stillRunning },
    { value: "finished", label: es.checkins.finished },
    { value: "problem", label: es.checkins.problem },
  ],
};

/** One job check-in. Opening it marks it read. Answering is one tap. Silence is allowed. */
export function CheckinCard({ checkin }: { checkin: JobCheckin }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (checkin.read_at) return;
    markCheckinRead(createSupabaseBrowserClient(), checkin.id).then(() => router.refresh()).catch(() => {});
  }, [checkin.id, checkin.read_at, router]);

  async function answer(value: CheckinAnswer) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await answerCheckin(createSupabaseBrowserClient(), checkin.id, value);
      router.refresh();
    } catch {
      setError(es.checkins.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card stack">
      <p className="muted">
        {es.checkins.label}
        {!checkin.read_at ? ` · ${es.checkins.unread}` : ""}
      </p>
      <p>{checkin.body}</p>
      {checkin.answer ? (
        <p className="muted">{es.checkins.answered}</p>
      ) : (
        <div className="chip-row">
          {OPTIONS[checkin.kind].map((o) => (
            <button key={o.value} className="button secondary" type="button" disabled={busy} onClick={() => answer(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <Link className="muted" href={`/trabajos/${checkin.job_id}`}>{es.notifications.disputeAction}</Link>
    </article>
  );
}
