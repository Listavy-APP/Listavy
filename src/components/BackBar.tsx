import Link from "next/link";
import { es } from "@/lib/i18n/es";

/**
 * Back control for sub-pages (UI phase §2). Every sub-page has a way back.
 * `label` is optional: pages that already show their title in an h1 pass none.
 */
export function BackBar({ href, label }: { href: string; label?: string }) {
  return (
    <div className="backbar">
      <Link className="back" href={href}>
        <span aria-hidden="true">‹</span>
        {es.common.back}
      </Link>
      {label ? <span className="bt">{label}</span> : null}
    </div>
  );
}
