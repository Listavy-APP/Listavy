import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { EmptyState } from "@/components/EmptyState";
import { InboxList } from "./InboxList";
import { listMyInbox } from "@/lib/data/notifications";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.inbox.title };

// Session-dependent page: read at request time, never cached.
export const instant = false;

export default async function NotificationsInboxPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/notificaciones");

  const entries = await listMyInbox(supabase);

  return (
    <section className="stack">
      <BackBar href="/" />
      <h1 className="page-title">{es.inbox.title}</h1>
      {entries.length === 0 ? (
        <EmptyState title={es.inbox.empty} body={es.inbox.emptyBody} />
      ) : (
        <InboxList entries={entries} />
      )}
    </section>
  );
}
