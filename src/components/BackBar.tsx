import Link from "next/link";
import { es } from "@/lib/i18n/es";

/** Sleek chevron. The label lives in aria-label, so the control is arrow-only on screen. */
export function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

/**
 * Back control for sub-pages (UI phase §2). Arrow only, 44 px tap target.
 * `label` is optional: pages that already show their title in an h1 pass none.
 */
export function BackBar({ href, label }: { href: string; label?: string }) {
  return (
    <div className="backbar">
      <Link className="back" href={href} aria-label={es.common.back}>
        <BackArrow />
      </Link>
      {label ? <span className="bt">{label}</span> : null}
    </div>
  );
}
