import Link from "next/link";
import { es } from "@/lib/i18n/es";
import { esVerification } from "@/lib/i18n/verification";
import { esTrust } from "@/lib/i18n/trust";
import { getCurrentProfile } from "@/lib/data/profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const LINKS = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/pendientes", label: es.adminPending.title },
  { href: "/admin/pagos", label: es.admin.navPayments },
  { href: "/admin/disputas", label: es.admin.navDisputes },
  { href: "/admin/resenas", label: es.admin.navReviews },
  { href: "/admin/destacados", label: es.admin.navBoosts },
  { href: "/admin/referidos", label: es.referral.navLabel },
  { href: "/admin/verificaciones", label: esVerification.admin.navLabel },
  { href: "/admin/fotos", label: esTrust.adminPhotos.navLabel },
  { href: "/admin/clientes", label: esTrust.adminClients.navLabel },
] as const;

const SUPER_LINKS = [{ href: "/admin/administradores", label: "Administradores" }] as const;

/** Admin section nav. `current` is the active href. Super-admin links show only to super admins. */
export async function AdminNav({ current }: { current: string }) {
  const profile = await getCurrentProfile(await createSupabaseServerClient());
  const links = profile?.admin_role === "super_admin" ? [...LINKS, ...SUPER_LINKS] : LINKS;
  return (
    <nav className="chip-row admin-nav" aria-label={es.admin.navLabel}>
      {links.map((l) => (
        <Link key={l.href} className={`chip${l.href === current ? " on" : ""}`} href={l.href} aria-current={l.href === current ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
