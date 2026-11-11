import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyPro } from "@/lib/data/pros";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
    </section>
  );
}
