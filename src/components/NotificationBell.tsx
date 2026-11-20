import Link from "next/link";
import { countMyUnread } from "@/lib/data/notifications";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Header bell with the unread count. Renders nothing for signed-out visitors. */
export async function NotificationBell() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const unread = await countMyUnread(supabase);
  const label = unread > 0 ? `${es.inbox.bell}, ${unread} ${es.inbox.unreadCount}` : es.inbox.bell;
  return (
    <Link className="link-quiet notification-bell" href="/notificaciones" aria-label={label} title={label}>
      <span aria-hidden="true">🔔</span>
      {unread > 0 ? (
        <span className="notification-badge" aria-hidden="true">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
