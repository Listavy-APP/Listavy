import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/data/profiles";
import { listPromoCodes, type AdminPromoCode } from "@/lib/data/promo";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PromoForm } from "./PromoForm";
import { PromoToggle } from "./PromoToggle";

export const metadata = { title: es.promo.admin.title };
export const instant = false;

function dateOnly(iso: string | null): string {
  if (!iso) return es.promo.admin.noExpiry;
  return new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santo_Domingo" });
}

function discountText(c: AdminPromoCode): string {
  return c.kind === "percent" ? `${c.value}%` : es.money.dop(c.value);
}

export default async function AdminPromosPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  // admin_list_promo_codes() is SECURITY DEFINER and checks is_admin().
  const rows = await listPromoCodes(supabase);

  return (
    <section className="stack">
      <h1>{es.promo.admin.title}</h1>
      <p className="muted">{es.promo.admin.subtitle}</p>
      <PromoForm />
      {rows.length === 0 ? (
        <p className="muted">{es.promo.admin.empty}</p>
      ) : (
        <ul className="stack">
          {rows.map((c) => (
            <li key={c.id} className="panel stack">
              <b>{c.code}</b>
              <span>
                {es.promo.admin.columns.discount}: {discountText(c)}
              </span>
              <span className="muted">
                {es.promo.admin.columns.window}: {dateOnly(c.starts_at)} – {dateOnly(c.expires_at)}
              </span>
              <span>
                {es.promo.admin.columns.uses}: {c.redeemed_count}
                {c.max_redemptions !== null ? ` / ${c.max_redemptions}` : ""} · {es.promo.admin.columns.reserved}: {c.reserved_count}
              </span>
              <span>{c.active ? es.promo.admin.active : es.promo.admin.inactive}</span>
              {c.note ? <span className="muted">{c.note}</span> : null}
              <PromoToggle id={c.id} active={c.active} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
