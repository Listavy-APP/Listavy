import Link from "next/link";
import { redirect } from "next/navigation";
import { InviteCard, type Quote } from "./InviteCard";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.jobs.inboxTitle };
export const instant = false;

export default async function InboxPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  // Quotes this pro was invited to. RLS limits rows to this pro.
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, status, amount_dop, includes, excludes, materials_included, window_start, window_end, duration_hours, invited_at, valid_until, job:jobs(id, trade, zone, description, status, job_type, voice_path)",
    )
    .eq("pro_id", userData.user.id)
    .order("invited_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`No se pudieron leer tus solicitudes: ${error.message}`);

  const rows = (data ?? []) as unknown as Quote[];
  const open = rows.filter((r) => r.status === "invited" && r.job && r.job.status === "requested");

  return (
    <section className="stack">
      <h1>{es.jobs.inboxTitle}</h1>
      {open.length === 0 ? <p className="muted">{es.jobs.inboxEmpty}</p> : null}
      {rows.map((r) => (
        <InviteCard key={r.id} quote={r} />
      ))}
      <Link className="button secondary" href="/cuenta">
        {es.common.back}
      </Link>
    </section>
  );
}
