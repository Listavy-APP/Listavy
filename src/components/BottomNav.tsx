"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { es } from "@/lib/i18n/es";

// Tab pages only. Flows (request, job, admin, login) keep their own back links.
const TABS = [
  { href: "/", label: es.nav.home },
  { href: "/buscar", label: es.nav.search },
  { href: "/trabajos", label: es.nav.jobs },
  { href: "/avisos", label: es.nav.notifications },
  { href: "/cuenta", label: es.nav.account },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  if (!TABS.some((t) => t.href === pathname)) return null;

  return (
    <nav className="bottom-nav" aria-label={es.nav.label}>
      {TABS.map((t) => {
        const current = t.href === pathname;
        return (
          <Link key={t.href} href={t.href} className="bottom-nav-tab" aria-current={current ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
