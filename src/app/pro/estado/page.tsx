import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyPro } from "@/lib/data/pros";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BoostPanel } from "./BoostPanel";
import { connection } from "next/server";

export const metadata = { title: es.proStatus.title };
export const instant = false;

export default async function ProStatusPage() {
    // Per-request render: the session is read at request time.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const pro = await getMyPro(supabase);

  // Current boost, if any. RLS limits this to the signed-in pro's own rows.
  const { data: activeBoost } = pro
    ? await supabase
        .from("boosts")
        .select("ends_at")
        .eq("pro_id", pro.id)
        .in("status", ["active", "paused"])
        .gt("ends_at", new Date().toISOString())
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  if (!pro) {
    return (
      <section className="stack">
        <h1>{es.proStatus.title}</h1>
        <p className="lead">{es.proStatus.none}</p>
        <Link className="button" href="/pro/registro">
          {es.proStatus.applyCta}
        </Link>
      </section>
    );
  }

  return (
    <section className="stack">
      <h1>{es.proStatus.title}</h1>
      <p className="lead">{es.proStatus[pro.verification_status]}</p>
      {pro.verification_status === "approved" && (
        <Link className="button" href={`/pro/${pro.id}`}>
          {es.search.viewProfile}
        </Link>
      )}
      {pro.verification_status === "approved" && activeBoost && (
        <p className="panel">
          {es.proStatus.boost.active(
            new Date(activeBoost.ends_at).toLocaleDateString("es-DO", {
              dateStyle: "long",
              timeZone: "America/Santo_Domingo",
            }),
          )}
        </p>
      )}
      {pro.verification_status === "approved" && !activeBoost && <BoostPanel />}
    </section>
  );
}
