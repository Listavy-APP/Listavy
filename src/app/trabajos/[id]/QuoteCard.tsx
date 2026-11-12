import { Avatar } from "@/components/Avatar";
import type { QuoteRow } from "@/lib/data/jobs";
import { formatWindow } from "@/lib/domain/window";
import { es } from "@/lib/i18n/es";

type ProInfo = { name: string | null; avatarUrl: string | null };

/** One quote, laid out so up to three can be compared at a glance: who, how much, when, what is included. */
export function QuoteCard(props: {
  quote: QuoteRow;
  pro: ProInfo | undefined;
  /** Shown only to the homeowner while the quote can still be chosen. */
  onApprove?: () => void;
  busy: boolean;
}) {
  const { quote: q, pro } = props;
  const sent = q.status === "sent";
  const name = pro?.name ?? es.jobs.proFallback;

  return (
    <article className="card">
      <div className="quote-head">
        <Avatar name={pro?.name ?? null} src={pro?.avatarUrl ?? null} />
        <div className="card-body">
          <p className="card-name">{name}</p>
          {!sent ? (
            <p className="muted">{es.jobs.quoteStatus[q.status as keyof typeof es.jobs.quoteStatus] ?? q.status}</p>
          ) : null}
        </div>
        {sent ? <span className="quote-price">{es.money.dop(q.amount_dop ?? 0)}</span> : null}
      </div>

      {sent ? (
        <>
          {q.includes ? <p>{q.includes}</p> : null}
          {q.excludes ? (
            <p className="muted">
              {es.jobs.excludesLabel}: {q.excludes}
            </p>
          ) : null}
          <dl className="quote-facts">
            {q.window_start && q.window_end ? (
              <>
                <dt>{es.jobs.quoteWindow}</dt>
                <dd>{formatWindow(q.window_start, q.window_end)}</dd>
              </>
            ) : null}
            {q.duration_hours != null ? (
              <>
                <dt>{es.jobs.quoteDuration}</dt>
                <dd>{es.jobs.quoteHours(Number(q.duration_hours))}</dd>
              </>
            ) : null}
            <dt>{es.jobs.quoteMaterials}</dt>
            <dd>{q.materials_included ? es.jobs.materialsYes : es.jobs.materialsNo}</dd>
          </dl>
        </>
      ) : null}

      {sent && props.onApprove ? (
        <button className="button" type="button" disabled={props.busy} onClick={props.onApprove}>
          {es.jobs.approve}
        </button>
      ) : null}
    </article>
  );
}
