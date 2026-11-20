import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { getCurrentProfile } from "@/lib/data/profiles";
import { listClientsByName, listSuspendedClients } from "@/lib/data/trust";
import { esTrust } from "@/lib/i18n/trust";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClientSuspensionActions } from "./ClientSuspensionActions";
import { ViewAsButton } from "@/components/ViewAsButton";

export const metadata = { title: esTrust.adminClients.title };

// Session-dependent page: read at request time, never cached.
export const instant = false;

export default async function AdminClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await connection();
  const { q = "" } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const [results, suspended] = await Promise.all([
    listClientsByName(supabase, q),
    listSuspendedClients(supabase),
  ]);
  const suspendedIds = new Set(suspended.map((s) => s.client_id));

  return (
    <section className="stack">
      <BackBar href="/admin" />
      <h1>{esTrust.adminClients.title}</h1>
      <p className="muted">{esTrust.adminClients.helpText}</p>

      <form className="admin-search" action="/admin/clientes" method="get">
        <label className="field">
          {esTrust.adminClients.searchLabel}
          <input type="search" name="q" defaultValue={q} minLength={2} />
        </label>
        <button className="button secondary" type="submit">{esTrust.adminClients.searchButton}</button>
      </form>

      {q.trim().length < 2 ? <p className="muted">{esTrust.adminClients.noResults}</p> : null}
      {results.map((c) => (
        <article key={c.id} className="card stack">
          <h2>{c.full_name ?? "—"}</h2>
          <p className="muted">{suspendedIds.has(c.id) ? esTrust.adminClients.suspendedTitle : ""}</p>
          <ClientSuspensionActions clientId={c.id} suspended={suspendedIds.has(c.id)} />
          {profile.admin_role === "super_admin" ? <ViewAsButton userId={c.id} /> : null}
        </article>
      ))}

      <h2>{esTrust.adminClients.suspendedTitle}</h2>
      {suspended.length === 0 ? <p className="muted">{esTrust.adminClients.noneSuspended}</p> : null}
      {suspended.map((s) => {
        const name = Array.isArray(s.profiles) ? s.profiles[0]?.full_name : s.profiles?.full_name;
        return (
          <article key={s.client_id} className="card stack">
            <h3>{name ?? "—"}</h3>
            <p className="muted">
              {esTrust.adminClients.suspendedSince} {new Date(s.suspended_at).toLocaleDateString("es-DO", { dateStyle: "medium", timeZone: "America/Santo_Domingo" })}
            </p>
            <ClientSuspensionActions clientId={s.client_id} suspended />
          </article>
        );
      })}
    </section>
  );
}
