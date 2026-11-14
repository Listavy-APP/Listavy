import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/data/profiles";
import { boostRefundPreview, listAdminBoosts, type AdminBoost } from "@/lib/data/admin";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../AdminNav";
import { BoostRefundButton } from "./BoostRefundButton";
import { BackBar } from "@/components/BackBar";

export const metadata = { title: es.admin.boosts.title };

// Session-dependent page: read at request time, never cached.
export const instant = false;

function dateOnly(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santo_Domingo" });
}

function stateOf(b: AdminBoost, now: number): keyof typeof es.admin.boosts & string {
  if (b.status === "refunded") return "refunded";
  if (b.status === "refund_due") return "refundDue";
  if (b.status === "paused") return "paused";
  if (b.status === "active") return new Date(b.ends_at).getTime() > now ? "active" : "expired";
  return "expired";
}

export default async function AdminBoostsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const boosts = await listAdminBoosts(supabase);
  const now = Date.now();

  // Refund owed per row. Only rows that can still be refunded are asked. The database decides.
  const owed = new Map<string, number | null>(
    await Promise.all(
      boosts
        .filter((b) => b.status === "active" || b.status === "paused" || b.status === "refund_due")
        .map(async (b) => [b.id, await boostRefundPreview(supabase, b.id)] as const),
    ),
  );

  return (
    <section className="stack">
      <AdminNav current="/admin/destacados" />
      <BackBar href="/admin" />
      <h1>{es.admin.boosts.title}</h1>
      <p className="muted">{es.admin.boosts.subtitle}</p>

      {boosts.length === 0 ? (
        <p className="muted">{es.admin.boosts.empty}</p>
      ) : (
        <ul className="stack">
          {boosts.map((b) => {
            const state = stateOf(b, now);
            const amount = owed.get(b.id) ?? null;
            const flag = b.flag_reason ? es.admin.boosts.flags[b.flag_reason] ?? b.flag_reason : null;
            return (
              <li key={b.id} className="panel stack">
                <b>{b.pro_name ?? "—"}</b>
                <span>
                  {es.admin.boosts[state as "active"]} · {b.duration_days} días · {es.money.dop(b.amount_dop)}
                </span>
                <span className="muted">
                  {es.admin.boosts.colStart}: {dateOnly(b.starts_at)} · {es.admin.boosts.colEnd}: {dateOnly(b.ends_at)}
                </span>
                {flag ? <span className="muted">{es.admin.boosts.colNote}: {flag}</span> : null}
                {b.status === "refunded" ? (
                  <span className="muted">
                    {es.admin.boosts.refunded}: {b.refund_amount_dop !== null ? es.money.dop(b.refund_amount_dop) : "—"} · {dateOnly(b.refunded_at)}
                  </span>
                ) : null}
                {amount !== null && amount > 0 ? (
                  <BoostRefundButton boostId={b.id} amountLabel={es.money.dop(amount)} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
