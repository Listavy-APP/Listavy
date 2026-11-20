import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PendingProActions } from "./PendingProActions";
import { ViewAsButton } from "@/components/ViewAsButton";
import { BackBar } from "@/components/BackBar";
import { getCurrentProfile } from "@/lib/data/profiles";
import { BUCKETS, signedUrl } from "@/lib/storage/proFiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { es } from "@/lib/i18n/es";

export const metadata = { title: es.adminPending.title };
export const instant = false;

type PendingPro = {
  id: string;
  trade: string;
  zone: string;
  city: string;
  price_min_dop: number;
  price_max_dop: number;
  created_at: string;
  pro_type: string;
  full_name: string | null;
  phone: string | null;
};

type FileRow = { pro_id: string; kind: string; storage_path: string };

const LIMIT_PHOTOS = 6;

function dop(n: number) {
  return `RD$${n.toLocaleString("es-DO", { maximumFractionDigits: 0 })}`;
}

function dateTime(iso: string) {
  return new Date(iso).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });
}

export default async function AdminPendingProsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  // admin_pending_pros() is SECURITY DEFINER and checks is_admin(). Direct pros reads are closed to the caller (0086).
  const { data: rows, error } = await supabase.rpc("admin_pending_pros", { p_limit: null });
  if (error) throw new Error(`No se pudieron leer las solicitudes: ${error.message}`);
  const pros = (rows ?? []) as unknown as PendingPro[];
  const ids = pros.map((p) => p.id);

  const [companiesRes, filesRes] = ids.length
    ? await Promise.all([
        // razon_social only. The RNC is never selected here.
        supabase.from("pro_companies").select("pro_id, razon_social").in("pro_id", ids),
        supabase
          .from("pro_files")
          .select("pro_id, kind, storage_path")
          .in("pro_id", ids)
          .in("kind", ["id_document", "company_document", "work_photo"])
          .order("created_at", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }];

  const companyByPro = new Map(
    ((companiesRes.data ?? []) as { pro_id: string; razon_social: string }[]).map((c) => [c.pro_id, c.razon_social]),
  );
  const filesByPro = new Map<string, FileRow[]>();
  for (const f of (filesRes.data ?? []) as FileRow[]) {
    const list = filesByPro.get(f.pro_id) ?? [];
    list.push(f);
    filesByPro.set(f.pro_id, list);
  }

  const cards = await Promise.all(
    pros.map(async (p) => {
      const files = filesByPro.get(p.id) ?? [];
      const idFile = files.find((f) => f.kind === "id_document");
      const companyFile = files.find((f) => f.kind === "company_document");
      const photos = files.filter((f) => f.kind === "work_photo").slice(0, LIMIT_PHOTOS);
      const [idUrl, companyUrl, photoUrls] = await Promise.all([
        idFile ? signedUrl(supabase, BUCKETS.documents, idFile.storage_path) : null,
        companyFile ? signedUrl(supabase, BUCKETS.documents, companyFile.storage_path) : null,
        Promise.all(photos.map((f) => signedUrl(supabase, BUCKETS.workPhotos, f.storage_path))),
      ]);
      return { pro: p, idUrl, companyUrl, photoUrls: photoUrls.filter((u): u is string => u !== null) };
    }),
  );

  return (
    <section className="stack">
      <BackBar href="/admin" />
      <h1>{es.adminPending.title}</h1>

      {cards.length === 0 ? <p className="muted">{es.adminPending.empty}</p> : null}

      {cards.map(({ pro, idUrl, companyUrl, photoUrls }) => {
        const company = pro.pro_type === "company";
        const razon = companyByPro.get(pro.id);
        return (
          <article key={pro.id} className="panel stack">
            <h2>{pro.full_name ?? "—"}</h2>
            {company ? (
              <p>
                <span className="badge">{es.adminPending.company}</span> {razon ?? ""}
              </p>
            ) : null}
            <dl className="stack">
              <div><dt className="muted">{es.adminPending.phone}</dt><dd>{pro.phone ?? "—"}</dd></div>
              <div><dt className="muted">{es.trades[pro.trade as keyof typeof es.trades] ?? pro.trade}</dt><dd>{pro.zone}, {pro.city}</dd></div>
              <div><dt className="muted">{es.adminPending.price}</dt><dd>{dop(pro.price_min_dop)} – {dop(pro.price_max_dop)}</dd></div>
              <div><dt className="muted">{es.adminPending.applied}</dt><dd>{dateTime(pro.created_at)}</dd></div>
            </dl>

            <h3>{es.adminPending.documents}</h3>
            {!idUrl && !companyUrl && photoUrls.length === 0 ? <p className="muted">{es.adminPending.noDocs}</p> : null}
            {idUrl ? (
              <p><a href={idUrl} target="_blank" rel="noreferrer">{es.adminPending.idDocument}</a></p>
            ) : null}
            {companyUrl ? (
              <p><a href={companyUrl} target="_blank" rel="noreferrer">{es.adminPending.companyDocument}</a></p>
            ) : null}
            {photoUrls.length > 0 ? (
              <div className="row">
                {photoUrls.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={es.adminPending.workPhotos} width={96} height={96} style={{ objectFit: "cover", borderRadius: 8 }} />
                  </a>
                ))}
              </div>
            ) : null}

            <p><Link href={`/pro/${pro.id}`}>{es.adminPending.viewProfile}</Link></p>
            <p className="muted">ID: {pro.id}</p>

            <PendingProActions proId={pro.id} />
            {profile.admin_role === "super_admin" ? <ViewAsButton userId={pro.id} /> : null}
          </article>
        );
      })}
    </section>
  );
}
