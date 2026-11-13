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

/** Stroke icons, 24 px grid, drawn in the current color. Icon-only nav: labels live in aria-label. */
function TabIcon({ href }: { href: (typeof TABS)[number]["href"] }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (href) {
    case "/":
      // Listavy mark: navy circle, white L, cyan check.
      return (
        <svg width={32} height={32} viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="16" fill="#0f172a" />
          <path d="M11 8.5v11h6.5" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="17.5,15.5 19.6,17.6 23.5,12.8" fill="none" stroke="#06b6d4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "/buscar":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4.2-4.2" />
        </svg>
      );
    case "/trabajos":
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2.5" />
          <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
          <path d="M3 12.5h18" />
        </svg>
      );
    case "/avisos":
      return (
        <svg {...common}>
          <path d="M6 9.5a6 6 0 1 1 12 0c0 4.5 1.8 6 1.8 6H4.2S6 14 6 9.5Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case "/cuenta":
      return (
        <svg {...common}>
          <circle cx="12" cy="8.5" r="4" />
          <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
        </svg>
      );
  }
}

export function BottomNav() {
  const pathname = usePathname();
  if (!TABS.some((t) => t.href === pathname)) return null;

  return (
    <nav className="bottom-nav" aria-label={es.nav.label}>
      {TABS.map((t) => {
        const current = t.href === pathname;
        return (
          <Link
            key={t.href}
            href={t.href}
            className="bottom-nav-tab"
            aria-label={t.label}
            aria-current={current ? "page" : undefined}
          >
            <span className="bottom-nav-well"><TabIcon href={t.href} /></span>
          </Link>
        );
      })}
    </nav>
  );
}
