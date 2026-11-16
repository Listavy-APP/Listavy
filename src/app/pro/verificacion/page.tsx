import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { getCurrentProfile } from "@/lib/data/profiles";
import { getMyPro } from "@/lib/data/pros";
import { listMyVerifications, type VerificationRow } from "@/lib/data/verification";
import { stagesFor, type Stage } from "@/lib/domain/verification";
import { esVerification as t } from "@/lib/i18n/verification";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VerificationForm } from "./VerificationForm";

export const metadata = { title: t.pageTitle };
// Session-dependent page: block on the server so the auth redirect returns a real status.
export const instant = false;

export default async function ProVerificationPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile(supabase);
  if (!profile) redirect("/login?next=/pro/verificacion");
  if (profile.role !== "pro") redirect("/cuenta");
  const pro = await getMyPro(supabase);
  if (!pro) redirect("/pro/registro");

  const rows = await listMyVerifications(supabase, profile.id);
  const stages = stagesFor(pro.pro_type, pro.trade);
  // Latest row per stage. Older rows stay in history.
  const latest = new Map<Stage, VerificationRow>();
  for (const r of rows) if (!latest.has(r.stage)) latest.set(r.stage, r);

  const statusText = (r: VerificationRow | undefined) =>
    !r ? t.statusNone : r.status === "approved" ? t.statusApproved : r.status === "rejected" ? t.statusRejected : t.statusPending;

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1>{t.pageTitle}</h1>
      <p className="muted">{t.intro}</p>

      <ul className="stack">
        {stages.map((s) => {
          const r = latest.get(s);
          return (
            <li key={s} className="panel stack">
              <b>{t.stageLabels[s]}</b>
              <span className="muted">{statusText(r)}</span>
              {r?.status === "rejected" && r.reason ? <span className="error">{t.rejectedReason} {r.reason}</span> : null}
              {r?.status === "approved" && r.expires_at ? <span className="muted">{r.expires_at}</span> : null}
            </li>
          );
        })}
      </ul>

      <h2>{t.form.submit}</h2>
      <VerificationForm proId={profile.id} stages={stages} />
    </section>
  );
}
