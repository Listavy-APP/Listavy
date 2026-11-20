import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { NewTicketForm } from "./NewTicketForm";
import { listMyJobsForTicket } from "@/lib/data/support";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.support.newTicket };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

export default async function NewTicketPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/ayuda/tickets/nuevo");

  const jobs = await listMyJobsForTicket(supabase);

  return (
    <section className="stack">
      <BackBar href="/ayuda/tickets" />
      <h1 className="page-title">{es.support.newTicket}</h1>
      <NewTicketForm jobs={jobs} />
    </section>
  );
}
