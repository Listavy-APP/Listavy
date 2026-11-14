import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { getProCardsByIds } from "@/lib/data/pros";
import { listSavedProIds } from "@/lib/data/saved";
import { es } from "@/lib/i18n/es";
import { avatarUrl } from "@/lib/storage/proFiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.saved.title };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

export default async function SavedProsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/cuenta/guardados");

  const ids = await listSavedProIds(supabase, userData.user.id);
  const pros = ids.length > 0 ? await getProCardsByIds(supabase, ids) : [];

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1 className="page-title">{es.saved.title}</h1>
      {pros.length === 0 ? (
        <EmptyState title={es.saved.title} body={es.saved.empty} actionHref="/buscar" actionLabel={es.search.title} />
      ) : (
        <div className="cards">
          {pros.map((p) => (
            <Link key={p.id} className="job-card" href={`/pro/${p.id}`}>
              <div className="job-card-top">
                <Avatar name={p.full_name} src={avatarUrl(supabase, p.avatar_path)} />
                <strong>{p.full_name ?? es.proDetail.title}</strong>
              </div>
              <div className="muted">
                {es.trades[p.trade]} · {p.zone}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
