import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { EmptyState } from "@/components/EmptyState";
import { JobCard } from "@/components/JobCard";
import { es } from "@/lib/i18n/es";
import { esViewAs } from "@/lib/i18n/view-as";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

type Row = {
  job_id: string;
  viewer_role: string;
  trade: string;
  zone: string;
  job_status: string;
  payment_status: string;
  created_at: string;
  amount_dop: number | null;
  pro_name: string | null;
};

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santo_Domingo" });

export default async function ViewAsJobs({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_view_as_jobs", { p_target: userId });
  const rows = (data ?? []) as Row[];

  return (
    <section className="stack">
      <BackBar href={`/admin/ver-como/${userId}`} label={esViewAs.homeJobs} />
      <h1 className="sr-only">{esViewAs.homeJobs}</h1>
      {rows.length === 0 ? <EmptyState title={esViewAs.noJobs} /> : (
        <div className="cards">
          {rows.map((j) => (
            <JobCard
              key={`${j.viewer_role}-${j.job_id}`}
              href={`/admin/ver-como/${userId}/trabajos/${j.job_id}`}
              title={es.trades[j.trade as keyof typeof es.trades] ?? j.trade}
              proName={j.pro_name}
              zone={j.zone}
              dateLabel={dateLabel(j.created_at)}
              statusLabel={es.profile.jobStatus[j.job_status as keyof typeof es.profile.jobStatus] ?? j.job_status}
              amountDop={j.amount_dop}
              noProLabel={es.profile.jobProFallback}
              showPro={j.viewer_role === "homeowner"}
            />
          ))}
        </div>
      )}
    </section>
  );
}
