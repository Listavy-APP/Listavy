"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { SignOutButton } from "../cuenta/SignOutButton";
import { es } from "@/lib/i18n/es";
import { esTrust } from "@/lib/i18n/trust";
import { esVerification } from "@/lib/i18n/verification";

export type AdminBadges = { pendientes: number; disputas: number; resenas: number; fotos: number; verificaciones: number; soporte: number };

type IconName = "grid" | "clock" | "alert" | "wallet" | "star" | "image" | "users" | "gift" | "zap" | "badge" | "key" | "chat";

const ICON_PATHS: Record<IconName, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  wallet: (
    <>
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M16 13h2" />
      <path d="M2 10h20" />
    </>
  ),
  star: <polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2" />,
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M17 11a4 4 0 0 1 0 8" />
      <path d="M1 21a8 8 0 0 1 16 0" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </>
  ),
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  badge: (
    <>
      <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z" />
      <polyline points="9 12 11 14 15 10" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2 21 2" />
      <path d="m18 5 3 3" />
      <path d="m15 8 2 2" />
    </>
  ),
};

function Glyph({ name }: { name: IconName }) {
  return (
    <svg className="admin-glyph" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

type NavItem = { href: string; label: string; icon: IconName; badge?: keyof AdminBadges; superOnly?: boolean };
type NavGroup = { title: string | null; items: NavItem[] };

const GROUPS: NavGroup[] = [
  { title: null, items: [{ href: "/admin", label: "Resumen", icon: "grid" }] },
  {
    title: "Operaciones",
    items: [
      { href: "/admin/pendientes", label: es.adminPending.title, icon: "clock", badge: "pendientes" },
      { href: "/admin/disputas", label: es.admin.navDisputes, icon: "alert", badge: "disputas" },
      { href: "/admin/pagos", label: es.admin.navPayments, icon: "wallet" },
      { href: "/admin/ingresos", label: es.admin.navRevenue, icon: "wallet" },
      { href: "/admin/soporte", label: es.support.adminNav, icon: "chat", badge: "soporte" },
    ],
  },
  {
    title: "Moderación",
    items: [
      { href: "/admin/resenas", label: es.admin.navReviews, icon: "star", badge: "resenas" },
      { href: "/admin/fotos", label: esTrust.adminPhotos.navLabel, icon: "image", badge: "fotos" },
      { href: "/admin/clientes", label: esTrust.adminClients.navLabel, icon: "users" },
      { href: "/admin/profesionales", label: es.adminPros.title, icon: "badge" },
    ],
  },
  {
    title: "Crecimiento",
    items: [
      { href: "/admin/referidos", label: es.referral.navLabel, icon: "gift" },
      { href: "/admin/promociones", label: es.promo.admin.navLabel, icon: "gift" },
      { href: "/admin/destacados", label: es.admin.navBoosts, icon: "zap" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/admin/verificaciones", label: esVerification.admin.navLabel, icon: "badge", badge: "verificaciones" },
      { href: "/admin/administradores", label: "Administradores", icon: "key", superOnly: true },
    ],
  },
];

const COLLAPSED_KEY = "listavy-admin-collapsed";

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

function titleFor(pathname: string): string {
  for (const g of GROUPS) for (const i of g.items) if (isActive(pathname, i.href)) return i.label;
  return "Administración";
}

export function AdminShell({
  badges,
  isSuper,
  userName,
  bell,
  children,
}: {
  badges: AdminBadges;
  isSuper: boolean;
  userName: string;
  bell: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reads the saved menu state after mount, so the server and first client render match.
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      /* storage blocked: keep default */
    }
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Closes the mobile drawer on route change. Syncs state to the route.
    setDrawerOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* storage blocked: state still changes for this view */
      }
      return next;
    });
  }

  const initial = (userName.trim()[0] ?? "A").toUpperCase();
  const shellClass = ["admin-shell", collapsed ? "is-collapsed" : "", drawerOpen ? "is-drawer-open" : ""].filter(Boolean).join(" ");

  return (
    <div className={shellClass}>
      <aside className="admin-sidebar" aria-label="Navegación de administración">
        <div className="admin-brand">
          <span className="admin-brand-mark" aria-hidden="true">L</span>
          <span className="admin-label admin-brand-name">Listavy</span>
          <button
            className="admin-collapse-btn"
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
            aria-expanded={!collapsed}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        <nav className="admin-nav">
          {GROUPS.map((g, gi) => {
            const items = g.items.filter((i) => !i.superOnly || isSuper);
            if (items.length === 0) return null;
            return (
              <div className="admin-nav-group" key={gi}>
                {g.title ? <h2 className="admin-group-title admin-label">{g.title}</h2> : null}
                {items.map((i) => {
                  const count = i.badge ? badges[i.badge] : 0;
                  const active = isActive(pathname, i.href);
                  return (
                    <Link
                      key={i.href}
                      href={i.href}
                      className="admin-navlink"
                      aria-current={active ? "page" : undefined}
                      title={i.label}
                    >
                      <Glyph name={i.icon} />
                      <span className="admin-label admin-navlabel">{i.label}</span>
                      {count > 0 ? (
                        <span className="admin-badge" aria-label={`${count} pendientes`}>
                          {count}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="admin-account">
          <span className="admin-avatar" aria-hidden="true">{initial}</span>
          <span className="admin-label admin-account-name">{userName}</span>
          <div className="admin-label admin-signout">
            <SignOutButton />
          </div>
        </div>
      </aside>

      <button
        className="admin-backdrop"
        type="button"
        aria-label="Cerrar menú"
        tabIndex={drawerOpen ? 0 : -1}
        onClick={() => setDrawerOpen(false)}
      />

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            className="admin-hamburger"
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={drawerOpen}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
          <p className="admin-topbar-title">{titleFor(pathname)}</p>
          <div className="admin-topbar-actions">
            {bell}
            <Link href="/cuenta" className="admin-avatar admin-avatar-link" aria-label="Mi cuenta">
              {initial}
            </Link>
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
