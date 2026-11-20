import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { RecurringList } from "./RecurringList";
import { listMyRecurringBookings } from "@/lib/data/recurring";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.recurring.title };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

export default async function RecurringPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/cuenta/recurrentes");

  const rows = await listMyRecurringBookings(supabase);

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1 className="page-title">{es.recurring.title}</h1>
      {rows.length === 0 ? (
        <div className="panel stack">
          <p>{es.recurring.empty}</p>
          <p className="muted">{es.recurring.emptyHelp}</p>
          <Link className="button secondary" href="/trabajos">
            {es.nav.jobs}
          </Link>
        </div>
      ) : (
        <RecurringList rows={rows} />
      )}
    </section>
  );
}
