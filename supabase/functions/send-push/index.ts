import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

// Sends a Web Push to every admin with a stored subscription. Called only by the
// notify_admins() DB function, which posts the shared PUSH_SECRET in x-push-secret.
// Required secrets: PUSH_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...).
// Expired or unsubscribed endpoints (404/410) are removed.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const expected = Deno.env.get("PUSH_SECRET") ?? "";
  const given = req.headers.get("x-push-secret") ?? "";
  if (!expected || !constantTimeEqual(given, expected)) return json({ error: "No autorizado." }, 401);

  const body = (await req.json().catch(() => null)) as { title?: string; body?: string; url?: string } | null;
  if (!body?.title || !body?.body) return json({ error: "Falta título o texto." }, 400);

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@listavy.app",
    Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
    Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
  );

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, profiles!inner(admin_role)")
    .not("profiles.admin_role", "is", null);
  if (error) return json({ error: error.message }, 500);

  const payload = JSON.stringify({ title: body.title, body: body.body, url: body.url ?? "/admin" });
  let sent = 0;
  const gone: string[] = [];
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 3600 },
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.push(s.id);
    }
  }
  if (gone.length > 0) await admin.from("push_subscriptions").delete().in("id", gone);

  return json({ sent, removed: gone.length });
});
