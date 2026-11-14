import { notFound, redirect } from "next/navigation";
import { AdminNav } from "../AdminNav";
import { connection } from "next/server";
import { ModerationButtons } from "./ModerationButtons";
import { ClearLimitButton } from "./ClearLimitButton";
import { getCurrentProfile } from "@/lib/data/profiles";
import { listAdminReviews } from "@/lib/data/reviews";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BackBar } from "@/components/BackBar";

export const metadata = { title: "Moderación de reseñas" };

// Session-dependent page: read at request time, never cached.
export const instant = false;

export default async function ReviewModerationPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const reviews = await listAdminReviews(supabase);
  // Flagged and held reviews first, then the rest by date.
  const sorted = [...reviews].sort((a, b) => {
    const pa = a.flag_reasons.length > 0 || a.held ? 0 : 1;
    const pb = b.flag_reasons.length > 0 || b.held ? 0 : 1;
    return pa - pb;
  });

  return (
    <section className="stack">
      <AdminNav current="/admin/resenas" />
      <BackBar href="/admin" />
      <h1>Moderación de reseñas</h1>
      {sorted.length === 0 ? <p className="muted">No hay reseñas.</p> : null}
      {sorted.map((r) => (
        <article key={r.id} className="card stack">
          <p>
            <b>{r.rating}/5</b> · estado: {r.status}
            {r.held ? " · en disputa" : ""}
            {r.flag_reasons.length > 0 ? ` · reportes: ${r.flag_reasons.join(", ")}` : ""}
          </p>
          {r.comment ? <p>{r.comment}</p> : <p className="muted">Sin comentario</p>}
          {r.status_reason ? <p className="muted">Motivo: {r.status_reason}</p> : null}
          <ModerationButtons reviewId={r.id} status={r.status} />
          <div className="stack">
            <span className="muted">Cliente de esta reseña (límite por calificaciones bajas)</span>
            <ClearLimitButton clientId={r.reviewer_id} />
          </div>
        </article>
      ))}
    </section>
  );
}
