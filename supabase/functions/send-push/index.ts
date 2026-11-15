import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

// Sends a Web Push to every admin with a stored subscription. Called only by the
// notify_admins() DB function, which posts the vault push_secret in x-push-secret.
// Required secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...). The shared push secret
// lives in Vault (push_secret) and is checked by verify_push_secret().
// Expired or unsubscribed endpoints (404/410) are removed.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

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

  const { data: allowed } = await admin.rpc("verify_push_secret", {
    p_secret: req.headers.get("x-push-secret") ?? "",
  });
  if (allowed !== true) return json({ error: "No autorizado." }, 401);

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
