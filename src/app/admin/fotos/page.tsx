import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminNav } from "../AdminNav";
import { BackBar } from "@/components/BackBar";
import { getCurrentProfile } from "@/lib/data/profiles";
import { jobFileUrl } from "@/lib/data/jobs";
import { listPhotoReports } from "@/lib/data/trust";
import { esTrust } from "@/lib/i18n/trust";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResolvePhotoReport } from "./ResolvePhotoReport";

export const metadata = { title: esTrust.adminPhotos.title };

// Session-dependent page: read at request time, never cached.
export const instant = false;

const STATUS_LABEL = {
  pending: esTrust.adminPhotos.pending,
  dismissed: esTrust.adminPhotos.dismissed,
  upheld: esTrust.adminPhotos.upheld,
} as const;

export default async function AdminPhotoReportsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const reports = await listPhotoReports(supabase);
  const withUrls = await Promise.all(
    reports.map(async (r) => ({ ...r, url: await jobFileUrl(supabase, r.storage_path) })),
  );

  return (
    <section className="stack">
      <AdminNav current="/admin/fotos" />
      <BackBar href="/admin" />
      <h1>{esTrust.adminPhotos.title}</h1>
      {withUrls.length === 0 ? <p className="muted">{esTrust.adminPhotos.empty}</p> : null}
      {withUrls.map((r) => (
        <article key={r.id} className="card stack">
          <h2>{STATUS_LABEL[r.status]}</h2>
          <p className="muted">
            {esTrust.adminPhotos.job} {r.job_id.slice(0, 8)}… · {new Date(r.created_at).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" })}
          </p>
          {r.url ? (
            <a href={r.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.url} alt={esTrust.adminPhotos.title} loading="lazy" style={{ maxWidth: 220, borderRadius: 8 }} />
            </a>
          ) : (
            <p className="muted">Foto no disponible.</p>
          )}
          <p>
            <strong>{esTrust.adminPhotos.reason}:</strong> {r.reason}
          </p>
          {r.status === "pending" ? (
            <ResolvePhotoReport reportId={r.id} />
          ) : (
            <p className="muted">
              {esTrust.adminPhotos.note}: {r.resolution_note}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
