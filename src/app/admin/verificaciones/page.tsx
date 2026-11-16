import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { AdminNav } from "../AdminNav";
import { VerificationReviewActions } from "./VerificationReviewActions";
import { BackBar } from "@/components/BackBar";
import { getCurrentProfile } from "@/lib/data/profiles";
import { listPendingVerifications } from "@/lib/data/verification";
import { BUCKETS, signedUrl } from "@/lib/storage/proFiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { needsExpiryInput, needsIssueInput } from "@/lib/domain/verification";
import { esVerification as t } from "@/lib/i18n/verification";

export const metadata = { title: t.admin.title };
// Session-dependent page: block on the server so the auth redirect returns a real status.
export const instant = false;

export default async function AdminVerificationsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const rows = await listPendingVerifications(supabase);
  const cards = await Promise.all(
    rows.map(async (r) => ({ row: r, url: r.storage_path ? await signedUrl(supabase, BUCKETS.documents, r.storage_path) : null })),
  );

  return (
    <section className="stack">
      <AdminNav current="/admin/verificaciones" />
      <BackBar href="/admin" />
      <h1>{t.admin.title}</h1>
      {cards.length === 0 ? <p className="muted">{t.admin.empty}</p> : null}
      {cards.map(({ row, url }) => (
        <article key={row.id} className="panel stack">
          <h2>{row.pro_name ?? "—"}</h2>
          <p><span className="badge">{t.stageLabels[row.stage]}</span></p>
          <p className="muted">{new Date(row.created_at).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" })}</p>
          {url ? <p><a href={url} target="_blank" rel="noreferrer">{t.admin.document}</a></p> : null}
          <p><Link href={`/pro/${row.pro_id}`}>Ver perfil</Link></p>
          <VerificationReviewActions
            id={row.id}
            needsIssue={needsIssueInput(row.stage)}
            needsExpiry={needsExpiryInput(row.stage)}
            isCompany={row.stage.startsWith("company_") || row.stage === "representative"}
          />
        </article>
      ))}
    </section>
  );
}
