import Link from "next/link";
import { redirect } from "next/navigation";
import { InviteCard, type Quote } from "./InviteCard";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { jobFileUrl } from "@/lib/data/jobs";

export const metadata = { title: es.jobs.inboxTitle };
export const instant = false;

export default async function InboxPage() {
    // Per-request render: the session is read at request time.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/pro/solicitudes");

  // Quotes this pro was invited to. RLS limits rows to this pro.
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, status, amount_dop, includes, excludes, materials_included, window_start, window_end, duration_hours, invited_at, valid_until, job:jobs!quotes_job_id_fkey(id, trade, zone, description, status, job_type, voice_path)",
    )
    .eq("pro_id", userData.user.id)
    .order("invited_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`No se pudieron leer tus solicitudes: ${error.message}`);

  const rows = (data ?? []) as unknown as Quote[];
  // A job moves to "quoted" when the first pro answers, and still accepts quotes from the other
  // invited pros (submit_quote). Both states are open for an invited pro.
  const jobOpen = (r: Quote) => r.job !== null && (r.job.status === "requested" || r.job.status === "quoted");
  const open = rows.filter((r) => r.status === "invited" && jobOpen(r));
  // Quotes this pro already sent and the client has not decided yet.
  const sent = rows.filter((r) => r.status === "sent" && jobOpen(r));

  // The client's photos of the problem. Invited pros may read them (job_photos policy, has_quoted_job).
  // The voice note is readable by invited pros (0079). Signed URLs use this pro's session.
  const voiceByJob = new Map<string, string>();
  for (const r of [...open, ...sent]) {
    if (!r.job?.voice_path || voiceByJob.has(r.job.id)) continue;
    const url = await jobFileUrl(supabase, r.job.voice_path);
    if (url) voiceByJob.set(r.job.id, url);
  }
  const jobIds = [...new Set([...open, ...sent].map((r) => r.job!.id))];
  const photosByJob = new Map<string, string[]>();
  if (jobIds.length > 0) {
    const { data: photoRows } = await supabase
      .from("job_photos")
      .select("job_id, storage_path")
      .in("job_id", jobIds)
      .eq("kind", "request")
      .order("created_at", { ascending: true });
    for (const p of (photoRows ?? []) as { job_id: string; storage_path: string }[]) {
      const url = await jobFileUrl(supabase, p.storage_path);
      if (url) photosByJob.set(p.job_id, [...(photosByJob.get(p.job_id) ?? []), url]);
    }
  }

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1>{es.jobs.inboxTitle}</h1>
      {open.length === 0 ? <p className="muted">{es.jobs.inboxEmpty}</p> : null}
      {open.map((r) => (
        <InviteCard key={r.id} quote={r} photoUrls={photosByJob.get(r.job!.id) ?? []} voiceUrl={voiceByJob.get(r.job!.id) ?? null} />
      ))}
      {sent.length > 0 ? <h2>{es.jobs.sentQuotesTitle}</h2> : null}
      {sent.map((r) => (
        <InviteCard key={r.id} quote={r} photoUrls={photosByJob.get(r.job!.id) ?? []} voiceUrl={voiceByJob.get(r.job!.id) ?? null} />
      ))}
    </section>
  );
}
