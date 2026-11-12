import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/data/profiles";
import { getReserveBalance, listAdminPayments, listDeductions, listOwedRecoveries } from "@/lib/data/admin";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
      <h1>{es.admin.title}</h1>
      <p>{es.admin.subtitle}</p>

      <h2>{es.admin.reserveTitle}</h2>
      <p>
        {es.admin.reserveBalance}: {es.money.dop(reserve)}
      </p>

      <h2>{es.admin.recoveriesTitle}</h2>
      {owed.length === 0 ? (
        <p>{es.admin.recoveriesEmpty}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{es.admin.colPro}</th>
                <th>{es.admin.colOwed}</th>
                <th>{es.admin.colSettled}</th>
                <th>{es.admin.colPending}</th>
                <th>{es.admin.colDate}</th>
              </tr>
            </thead>
            <tbody>
              {owed.map((r) => (
                <tr key={r.id}>
                  <td>{r.pro_name ?? short(r.pro_id)}</td>
                  <td>{es.money.dop(r.amount_dop)}</td>
                  <td>{es.money.dop(r.settled_dop)}</td>
                  <td>{es.money.dop(r.amount_dop - r.settled_dop)}</td>
                  <td>{dateOnly(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>{es.admin.paymentsTitle}</h2>
      {payments.length === 0 ? (
        <p>{es.admin.paymentsEmpty}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{es.admin.colStatus}</th>
                <th>{es.admin.colJob}</th>
                <th>{es.admin.colAmount}</th>
                <th>{es.admin.colCommission}</th>
                <th>{es.admin.colPayout}</th>
                <th>{es.admin.colRecovery}</th>
                <th>{es.admin.colKept}</th>
                <th>{es.admin.colRefunded}</th>
                <th>{es.admin.colStripe}</th>
                <th>{es.admin.colDate}</th>
                <th>{es.admin.colRelease}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{es.admin.statuses[p.status]}</td>
                  <td>{short(p.job_id)}</td>
                  <td>
                    {usd(p.amount_minor)} / {es.money.dop(p.amount_dop)}
                  </td>
                  <td>{es.money.dop(p.commission_dop)}</td>
                  <td>{es.money.dop(p.pro_payout_dop)}</td>
                  <td>{p.recovery_netted_dop > 0 ? es.money.dop(p.recovery_netted_dop) : "—"}</td>
                  <td>
                    {p.keep_dop === null
                      ? "—"
                      : `${es.money.dop(p.keep_dop)} / ${es.money.dop(p.keep_pro_payout_dop ?? 0)} + ${es.money.dop(p.keep_commission_dop ?? 0)}`}
                  </td>
                  <td>{p.refunded_minor > 0 ? usd(p.refunded_minor) : "—"}</td>
                  <td>
                    <div>PI: {short(p.stripe_payment_intent_id)}</div>
                    <div>TR: {short(p.stripe_transfer_id)}</div>
                  </td>
                  <td>{dateOnly(p.created_at)}</td>
                  <td>{dateOnly(p.released_at ?? p.release_after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>{es.admin.deductionsTitle}</h2>
      {deductions.length === 0 ? (
        <p>{es.admin.deductionsEmpty}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{es.admin.colPayment}</th>
                <th>{es.admin.colDebt}</th>
                <th>{es.admin.colAmount}</th>
                <th>{es.admin.colDate}</th>
                <th>{es.admin.colState}</th>
              </tr>
            </thead>
            <tbody>
              {deductions.map((d) => (
                <tr key={d.id}>
                  <td>{short(d.payment_id)}</td>
                  <td>{short(d.recovery_id)}</td>
                  <td>{es.money.dop(d.amount_dop)}</td>
                  <td>{dateOnly(d.created_at)}</td>
                  <td>{d.reversed_at ? es.admin.deductionReversed : es.admin.deductionApplied}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
