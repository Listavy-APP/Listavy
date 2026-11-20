import { createClient } from "npm:@supabase/supabase-js@2";
import { safeLink } from "../_shared/notification-copy.ts";
import webpush from "npm:web-push@3";

// Sends a Web Push. Two modes, both called only by DB functions that post the vault push_secret:
//   * admin mode (no user_id): every admin with a stored subscription, from notify_admins().
//   * user mode (user_id set): every device of that user, from notify_user_push(). Logs each attempt.
// v2 (0091): user mode added. Admin mode is unchanged.
// Required secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...). The shared push secret
// lives in Vault (push_secret) and is checked by verify_push_secret().
// Expired or unsubscribed endpoints (404/410) are removed.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const body = (await req.json().catch(() => null)) as {
    title?: string; body?: string; url?: string; user_id?: string; kind?: string;
  } | null;
  if (!body?.title || !body?.body) return json({ error: "Falta título o texto." }, 400);

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@listavy.app",
    Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
    Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
  );

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: allowed } = await admin.rpc("verify_push_secret", {
    p_secret: req.headers.get("x-push-secret") ?? "",
  });
  if (allowed !== true) return json({ error: "No autorizado." }, 401);

  const userId = body.user_id ?? null;
  const kind = body.kind ?? "admin_alert";
  const { data: subs, error } = userId
    ? await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId)
    : await admin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth, profiles!inner(admin_role)")
        .not("profiles.admin_role", "is", null);
  if (error) return json({ error: error.message }, 500);

  if (userId && (subs ?? []).length === 0) {
    await admin.from("notification_log").insert({ user_id: userId, channel: "push", kind, status: "no_subscription", link: safeLink(body.url) });
    return json({ sent: 0, removed: 0, failed: 0 });
  }

  const payload = JSON.stringify({ title: body.title, body: body.body, url: body.url ?? (userId ? "/" : "/admin") });
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 3600 },
      );
      sent++;
      if (userId) await admin.from("notification_log").insert({ user_id: userId, channel: "push", kind, status: "sent", link: safeLink(body.url) });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        gone.push(s.id);
      } else {
        // Log the subscription id, status and message only. The endpoint URL is a credential.
        failed++;
        const message = (err as Error).message;
        console.error("send-push failed", { subscriptionId: s.id, status: status ?? null, message });
        if (userId) {
          await admin.from("notification_log").insert({
            user_id: userId, channel: "push", kind, status: "failed", link: safeLink(body.url),
            detail: `subscription=${s.id} status=${status ?? "none"} message=${message}`.slice(0, 500),
          });
        }
      }
    }
  }
  if (gone.length > 0) await admin.from("push_subscriptions").delete().in("id", gone);

  return json({ sent, removed: gone.length, failed });
});
