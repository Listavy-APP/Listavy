import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { EmptyState } from "@/components/EmptyState";
import { es } from "@/lib/i18n/es";
import { esViewAs } from "@/lib/i18n/view-as";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

type Group = { group_id: string; notice_kind: string; notice_link: string | null; last_at: string; delivered: boolean; unread: boolean };

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });

export default async function ViewAsNotifications({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_view_as_notifications", { p_target: userId, p_limit: 50 });
  const groups = (data ?? []) as Group[];

  return (
    <section className="stack">
      <BackBar href={`/admin/ver-como/${userId}`} label={esViewAs.homeNotifications} />
      <h1 className="sr-only">{esViewAs.homeNotifications}</h1>
      {groups.length === 0 ? <EmptyState title={esViewAs.noNotifications} /> : (
        <ul className="stack">
          {groups.map((g) => (
            <li key={g.group_id} className="panel">
              <b>{es.inbox.kinds[g.notice_kind as keyof typeof es.inbox.kinds] ?? es.inbox.fallbackKind}</b>
              <div className="muted">
                {dateTime(g.last_at)}{g.unread ? ` · ${es.inbox.unread}` : ""}{g.delivered ? "" : ` · ${es.inbox.notDelivered}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
