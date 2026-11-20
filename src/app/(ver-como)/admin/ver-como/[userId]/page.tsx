import Link from "next/link";
import { connection } from "next/server";
import { esViewAs } from "@/lib/i18n/view-as";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

type Target = { user_id: string; full_name: string | null; user_role: string };
type Payout = { bank_code: string; branch_code: string | null; account_masked: string };

export default async function ViewAsHome({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  await connection();
  const supabase = await createSupabaseServerClient();

  const { data: profileRows } = await supabase.rpc("admin_view_as_profile", { p_target: userId });
  const target = ((profileRows ?? []) as Target[])[0];
  if (!target) return null;

  const { data: jobRows } = await supabase.rpc("admin_view_as_jobs", { p_target: userId });
  const jobCount = (jobRows ?? []).length;

  const isPro = target.user_role === "pro";
  const payout = isPro
    ? (((await supabase.rpc("admin_view_as_payout", { p_target: userId })).data ?? []) as Payout[])[0] ?? null
    : null;

  const roleLabel = target.user_role === "pro" ? esViewAs.rolePro : target.user_role === "homeowner" ? esViewAs.roleHomeowner : esViewAs.roleOther;

  return (
    <section className="stack">
      <h1>{target.full_name ?? "—"}</h1>
      <p className="muted">{roleLabel}</p>

      <nav className="stack" aria-label={esViewAs.bannerLabel}>
        <Link className="panel" href={`/admin/ver-como/${userId}/trabajos`}>
          <b>{esViewAs.homeJobs}</b> <span className="muted">{jobCount}</span>
        </Link>
        <Link className="panel" href={`/admin/ver-como/${userId}/notificaciones`}>
          <b>{esViewAs.homeNotifications}</b>
        </Link>
      </nav>

      {isPro ? (
        <section className="panel stack" aria-labelledby="view-as-bank">
          <h2 id="view-as-bank">{esViewAs.homeBank}</h2>
          {payout ? (
            <dl className="stack">
              <div><dt className="muted">{esViewAs.bankCode}</dt><dd>{payout.bank_code}</dd></div>
              {payout.branch_code ? <div><dt className="muted">{esViewAs.branchCode}</dt><dd>{payout.branch_code}</dd></div> : null}
              <div><dt className="muted">{esViewAs.account}</dt><dd>{payout.account_masked}</dd></div>
            </dl>
          ) : (
            <p className="muted">{esViewAs.noBank}</p>
          )}
        </section>
      ) : null}
    </section>
  );
}
