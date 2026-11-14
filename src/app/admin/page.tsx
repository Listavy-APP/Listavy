import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/data/profiles";
import { getReserveBalance, listAdminPayments, listDeductions, listOwedRecoveries } from "@/lib/data/admin";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminNav } from "./AdminNav";
import { RecordList } from "./RecordList";
import { BackBar } from "@/components/BackBar";

export const metadata = { title: es.admin.title };

// Session-dependent page: read at request time, never cached.
export const instant = false;

function usd(minor: number): string {
  return `US$${(minor / 100).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateOnly(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" });
}

function short(id: string | null): string {
  return id ? `${id.slice(0, 8)}…` : "—";
}

export default async function AdminPayoutsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const [payments, reserve, owed, deductions] = await Promise.all([
    listAdminPayments(supabase),
    getReserveBalance(supabase),
    listOwedRecoveries(supabase),
    listDeductions(supabase),
  ]);

  return (
    <section className="stack">
      <AdminNav current="/admin" />
      <BackBar href="/" />
      <h1>{es.admin.title}</h1>
      <p className="muted">{es.admin.subtitle}</p>

      <div className="stat">
        <span className="stat-label">{es.admin.reserveBalance}</span>
        <span className="stat-value">{es.money.dop(reserve)}</span>
      </div>

      <h2>{es.admin.recoveriesTitle}</h2>
      {owed.length === 0 ? (
        <p className="muted">{es.admin.recoveriesEmpty}</p>
      ) : (
        <RecordList
          items={owed.map((r) => ({
            key: r.id,
            title: r.pro_name ?? short(r.pro_id),
            rows: [
              [es.admin.colOwed, es.money.dop(r.amount_dop)],
              [es.admin.colSettled, es.money.dop(r.settled_dop)],
              [es.admin.colPending, es.money.dop(r.amount_dop - r.settled_dop)],
              [es.admin.colDate, dateOnly(r.created_at)],
            ],
          }))}
        />
      )}

      <h2>{es.admin.paymentsTitle}</h2>
      {payments.length === 0 ? (
        <p className="muted">{es.admin.paymentsEmpty}</p>
      ) : (
        <RecordList
          items={payments.map((p) => ({
            key: p.id,
            title: `${es.admin.statuses[p.status]} · ${short(p.job_id)}`,
            rows: [
              [es.admin.colAmount, `${usd(p.amount_minor)} / ${es.money.dop(p.amount_dop)}`],
              [es.admin.colCommission, es.money.dop(p.commission_dop)],
              [es.admin.colPayout, es.money.dop(p.pro_payout_dop)],
              [es.admin.colRecovery, p.recovery_netted_dop > 0 ? es.money.dop(p.recovery_netted_dop) : "—"],
              [
                es.admin.colKept,
                p.keep_dop === null
                  ? "—"
                  : `${es.money.dop(p.keep_dop)} / ${es.money.dop(p.keep_pro_payout_dop ?? 0)} + ${es.money.dop(p.keep_commission_dop ?? 0)}`,
              ],
              [es.admin.colRefunded, p.refunded_minor > 0 ? usd(p.refunded_minor) : "—"],
              [es.admin.colStripe, `PI ${short(p.stripe_payment_intent_id)} · TR ${short(p.stripe_transfer_id)}`],
              [es.admin.colDate, dateOnly(p.created_at)],
              [es.admin.colRelease, dateOnly(p.released_at ?? p.release_after)],
            ],
          }))}
        />
      )}

      <h2>{es.admin.deductionsTitle}</h2>
      {deductions.length === 0 ? (
        <p className="muted">{es.admin.deductionsEmpty}</p>
      ) : (
        <RecordList
          items={deductions.map((d) => ({
            key: d.id,
            title: `${short(d.payment_id)} · ${short(d.recovery_id)}`,
            rows: [
              [es.admin.colAmount, es.money.dop(d.amount_dop)],
              [es.admin.colDate, dateOnly(d.created_at)],
              [es.admin.colState, d.reversed_at ? es.admin.deductionReversed : es.admin.deductionApplied],
            ],
          }))}
        />
      )}
    </section>
  );
}
