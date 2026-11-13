import Link from "next/link";

/** Designed empty state: a title, one line of context, and an optional next step. */
export function EmptyState({
  title,
  body,
  actionHref,
  actionLabel,
}: {
  title: string;
  body?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="panel empty-state" role="status">
      <p className="empty-title">{title}</p>
      {body ? <p className="muted">{body}</p> : null}
      {actionHref && actionLabel ? (
        <Link className="button secondary" href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
