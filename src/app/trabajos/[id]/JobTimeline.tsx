import { jobTimeline } from "@/lib/domain/timeline";
import { es } from "@/lib/i18n/es";

/** Six-step progress for a job. Cancelled and disputed jobs show their status line instead. */
export function JobTimeline(props: {
  status: string;
  paymentStatus: string;
  quotesResponded: number;
  quotesTotal: number;
}) {
  const t = jobTimeline(props.status, props.paymentStatus);
  if (t.terminal) return null;

  return (
    <section className="stack" aria-labelledby="timeline-title">
      <h2 id="timeline-title">{es.jobs.timelineTitle}</h2>
      <ol className="timeline">
        {t.steps.map((s) => (
          <li key={s.id} className={`tl-step ${s.state}`} aria-current={s.state === "current" ? "step" : undefined}>
            <span className="tl-mark" aria-hidden="true">{s.state === "done" ? "✓" : ""}</span>
            <span className="tl-label">
              {es.jobs.timeline[s.id]}
              {s.state !== "todo" ? (
                <span className="sr-only"> ({s.state === "done" ? es.jobs.timeline.stateDone : es.jobs.timeline.stateCurrent})</span>
              ) : null}
              {s.id === "quotes" && s.state === "current" && props.quotesTotal > 0 ? (
                <span className="tl-sub">{es.jobs.timeline.quotesCount(props.quotesResponded, props.quotesTotal)}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
