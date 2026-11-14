import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/data/profiles";
import { listJobsForUser } from "@/lib/data/customer";
import { es } from "@/lib/i18n/es";
import { EmptyState } from "@/components/EmptyState";
import { JobCard } from "@/components/JobCard";
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
        <div className="cards">
          {jobs.map((j) => (
            <JobCard
              key={j.id}
              href={`/trabajos/${j.id}`}
              title={es.trades[j.trade as keyof typeof es.trades] ?? j.trade}
              proName={j.pros?.profiles?.full_name ?? null}
              zone={j.zone}
              dateLabel={formatDate(j.created_at)}
              statusLabel={
                j.status === "accepted" && j.payment_status === "unpaid"
                  ? es.profile.jobStatusUnpaid
                  : (es.profile.jobStatus[j.status as keyof typeof es.profile.jobStatus] ?? j.status)
              }
              amountDop={j.approved_quote?.amount_dop ?? null}
              noProLabel={es.profile.jobProFallback}
              showPro={profile?.role !== "pro"}
            />
          ))}
        </div>
      )}
    </section>
  );
}
