import { redirect } from "next/navigation";
import { connection } from "next/server";
import { listMyNotifications } from "@/lib/data/disputes";
import { EmptyState } from "@/components/EmptyState";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.notifications.title };

// Session-dependent page: read at request time, never cached.
export const instant = false;

export default async function NotificationsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const rows = await listMyNotifications(supabase);

  return (
    <section className="stack">
      <h1>{es.notifications.title}</h1>
      {rows.length === 0 ? (
        <EmptyState title={es.notifications.empty} body={es.notifications.emptyBody} actionHref="/buscar" actionLabel={es.search.title} />
      ) : null}
      {rows.map((n) => (
        <article key={n.id} className="card stack">
          <p className="muted">
            {es.notifications.kinds[n.kind]} ·{" "}
            {new Date(n.created_at).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "medium", timeStyle: "short" })}
          </p>
          <p>{n.body}</p>
        </article>
      ))}
    </section>
  );
}
