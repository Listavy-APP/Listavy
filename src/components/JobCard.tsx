import Link from "next/link";

/**
 * Job card for account and job lists (UI phase §6): trade, pro, date, status and price.
 * Shows only what the caller passes; money is formatted here, never computed here.
 */
export function JobCard(props: {
  href: string;
  title: string;
  proName: string | null;
  zone: string;
  dateLabel: string;
  statusLabel: string;
  amountDop: number | null;
  noProLabel: string;
}) {
  return (
    <Link className="job-card" href={props.href}>
      <div className="job-card-top">
        <strong>{props.title}</strong>
        <span className="status-pill">{props.statusLabel}</span>
      </div>
      <div className="muted">
        {props.proName ?? props.noProLabel} · {props.zone} · {props.dateLabel}
      </div>
      {props.amountDop !== null ? (
        <div className="job-card-amount">RD${props.amountDop.toLocaleString("es-DO")}</div>
      ) : null}
    </Link>
  );
}
