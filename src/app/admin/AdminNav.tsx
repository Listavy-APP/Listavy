import Link from "next/link";
import { es } from "@/lib/i18n/es";

const LINKS = [
  { href: "/admin", label: es.admin.navPayments },
  { href: "/admin/disputas", label: es.admin.navDisputes },
  { href: "/admin/resenas", label: es.admin.navReviews },
  { href: "/admin/destacados", label: es.admin.navBoosts },
] as const;

/** Admin section nav. `current` is the active href. */
export function AdminNav({ current }: { current: string }) {
  return (
    <nav className="chip-row admin-nav" aria-label={es.admin.navLabel}>
      {LINKS.map((l) => (
        <Link key={l.href} className={`chip${l.href === current ? " on" : ""}`} href={l.href} aria-current={l.href === current ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
