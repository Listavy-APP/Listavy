// Listavy · send-email (0091)
// Transactional email for notify_user_email(). Called only by DB functions that post the vault
// push_secret in x-push-secret (same gate as send-push). Service role reads the profile and job.
//
// Rules:
//   * Sends only to a profile whose email_verified_at is set. Checked again here, not only in SQL.
//   * Every attempt is logged to notification_log (sent, failed, or skipped_unverified).
//   * The Stripe receipt link is fetched when a payment intent exists and STRIPE_SECRET_KEY is set.
//     If the lookup fails, the email sends without the link.
// Requires secrets: RESEND_API_KEY, EMAIL_FROM (optional), APP_URL (optional), STRIPE_SECRET_KEY (optional).

import { createClient } from "npm:@supabase/supabase-js@2";
import { linkFor, renderEmail } from "../_shared/notification-copy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Listavy <no-reply@listavy.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://listavy.com";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function receiptUrl(paymentIntentId: string): Promise<string | null> {
  if (!STRIPE_KEY) return null;
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge`,
      { headers: { Authorization: `Bearer ${STRIPE_KEY}` } },
    );
    if (!res.ok) return null;
    const pi = (await res.json()) as { latest_charge?: { receipt_url?: string } | string | null };
    const charge = pi.latest_charge;
    return charge && typeof charge === "object" && charge.receipt_url ? charge.receipt_url : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: allowed } = await admin.rpc("verify_push_secret", {
    p_secret: req.headers.get("x-push-secret") ?? "",
  });
  if (allowed !== true) return json({ error: "No autorizado." }, 401);

  const body = (await req.json().catch(() => null)) as {
    user_id?: string; kind?: string; data?: Record<string, unknown>;
  } | null;
  if (!body?.user_id || !body.kind) return json({ error: "Falta usuario o tipo." }, 400);
  const userId = body.user_id;
  const kind = body.kind;
  const data = body.data ?? {};

  const { data: profile } = await admin
    .from("profiles")
    .select("email, email_verified_at, full_name")
    .eq("id", userId)
    .maybeSingle();

  // Hard rule: no transactional mail to an unverified address.
  if (!profile?.email || !profile.email_verified_at) {
    await admin.from("notification_log").insert({ user_id: userId, channel: "email", kind, status: "skipped_unverified", link: linkFor(kind, data) });
    return json({ sent: false, reason: "unverified" });
  }

  let trade: string | undefined;
  let zone: string | undefined;
  if (typeof data.job_id === "string") {
    const { data: job } = await admin.from("jobs").select("trade, zone").eq("id", data.job_id).maybeSingle();
    trade = job?.trade ?? undefined;
    zone = job?.zone ?? undefined;
  }

  // Professional name from the catalog, so new lines read correctly in mail (0109). Falls back in the copy module.
  const tradeKey = trade ?? (typeof data.trade === "string" ? data.trade : undefined);
  let tradeLabel: string | undefined;
  if (tradeKey) {
    const { data: t } = await admin.from("trades").select("pro_label_es, label_es").eq("key", tradeKey).maybeSingle();
    tradeLabel = (t?.pro_label_es as string | null) ?? (t?.label_es as string | undefined) ?? undefined;
  }

  const enriched: Record<string, unknown> = { ...data };
  if (kind === "receipt" && typeof data.payment_intent_id === "string") {
    const url = await receiptUrl(data.payment_intent_id);
    if (url) enriched.receipt_url = url;
  }

  const email = renderEmail(kind, enriched, {
    appUrl: APP_URL,
    name: profile.full_name ?? null,
    trade,
    tradeLabel,
    zone,
  });
  if (!email) return json({ error: "Tipo de correo no válido." }, 400);

  if (!RESEND_KEY) {
    await admin.from("notification_log").insert({ user_id: userId, channel: "email", kind, status: "failed", detail: "RESEND_API_KEY no configurada", link: linkFor(kind, data) });
    return json({ error: "El envío de correos no está configurado." }, 503);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [profile.email], subject: email.subject, text: email.text }),
  });

  if (!res.ok) {
    // Log the status only. The recipient address is personal data and stays out of the log.
    await admin.from("notification_log").insert({
      user_id: userId, channel: "email", kind, status: "failed", detail: `resend status=${res.status}`, link: linkFor(kind, data),
    });
    return json({ sent: false, reason: "provider" }, 502);
  }

  await admin.from("notification_log").insert({ user_id: userId, channel: "email", kind, status: "sent", link: linkFor(kind, data) });
  return json({ sent: true });
});
