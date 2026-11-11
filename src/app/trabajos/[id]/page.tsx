import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JobActions } from "./JobActions";
import { getCompletionCode, getContactPhone, jobFileUrl, type JobPhotoRow, type JobRow, type QuoteRow } from "@/lib/data/jobs";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.jobs.jobTitle };
export const instant = false;

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  const uid = userData.user.id;

  const { data: job } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
  if (!job) notFound();
  const j = job as JobRow;

  const role = j.homeowner_id === uid ? "homeowner" : j.pro_id === uid ? "pro" : null;
  if (!role) {
    // An invited pro who has not been chosen goes to the inbox.
    redirect("/pro/solicitudes");
  }

  const [quotesRes, photosRes] = await Promise.all([
    supabase.from("quotes").select("*").eq("job_id", id).order("invited_at", { ascending: true }),
    supabase.from("job_photos").select("id, kind, storage_path").eq("job_id", id).order("created_at", { ascending: true }),
  ]);
  const quotes = (quotesRes.data ?? []) as QuoteRow[];
  const photos = (photosRes.data ?? []) as JobPhotoRow[];

  const photoUrls = await Promise.all(
    photos.map(async (p) => ({ kind: p.kind, url: await jobFileUrl(supabase, p.storage_path) })),
  );

  const contactPhone = await getContactPhone(supabase, id);
  const completionCode =
    role === "pro" && j.status === "in_progress" ? await getCompletionCode(supabase, id) : null;

  return (
    <section className="stack">
      <div className="backbar">
        <Link className="back" href={role === "pro" ? "/pro/solicitudes" : "/cuenta"} aria-label={es.common.back}>
          ‹
        </Link>
        <span className="bt">{es.jobs.jobTitle}</span>
      </div>

      <h1>
        {es.trades[j.trade as keyof typeof es.trades] ?? j.trade} · {j.zone}
      </h1>
      <p>{j.description}</p>
      <p className="muted">
        {j.job_type === "diagnostic" ? es.jobs.typeDiagnostic : es.jobs.typeRepair} ·{" "}
        {es.jobs.statusLabel[j.status as keyof typeof es.jobs.statusLabel] ?? j.status}
      </p>

      <JobActions
        userId={uid}
        role={role}
        job={j}
        quotes={quotes}
        photos={photoUrls}
        contactPhone={contactPhone}
        completionCode={completionCode}
      />
    </section>
  );
}
