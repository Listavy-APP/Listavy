import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/data/profiles";
import { listJobsForUser } from "@/lib/data/customer";
import { es } from "@/lib/i18n/es";
import { EmptyState } from "@/components/EmptyState";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.trabajos.title };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" });
}

export default async function TrabajosPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  const jobs = profile ? await listJobsForUser(supabase, profile.id) : [];

  return (
    <section className="stack">
      <h1>{es.trabajos.title}</h1>
      {jobs.length === 0 ? (
        <EmptyState title={es.trabajos.emptyTitle} body={es.trabajos.empty} actionHref="/buscar" actionLabel={es.trabajos.findPro} />
      ) : (
        <ul className="list">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/trabajos/${j.id}`}>
                <strong>{es.trades[j.trade as keyof typeof es.trades] ?? j.trade}</strong> · {j.zone} · {formatDate(j.created_at)}
              </Link>
              <div className="muted">
                {j.status === "accepted" && j.payment_status === "unpaid"
                  ? es.profile.jobStatusUnpaid
                  : (es.profile.jobStatus[j.status as keyof typeof es.profile.jobStatus] ?? j.status)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
