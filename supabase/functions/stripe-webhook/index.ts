import { createClient } from "npm:@supabase/supabase-js@2";

const TOLERANCE_SECONDS = 300;
const enc = new TextEncoder();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>]. Signed payload is "<t>.<raw body>".
async function signatureValid(raw: string, header: string, secret: string): Promise<boolean> {
  let t = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") t = v ?? "";
    if (k === "v1" && v) sigs.push(v);
  }
  if (!t || sigs.length === 0) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(t + "." + raw));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => constantTimeEqual(s, expected));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!secret.startsWith("whsec_")) return new Response("webhook not configured", { status: 503 });

  const raw = await req.text();
  const header = req.headers.get("stripe-signature") ?? "";
  if (!(await signatureValid(raw, header, secret))) {
    return new Response("invalid signature", { status: 400 });
  }

  const event = JSON.parse(raw);
  if (event.type !== "checkout.session.completed") {
    // Other event types are acknowledged and ignored in this slice.
    return json({ received: true, ignored: event.type });
  }

  const session = event.data.object;
  if (session.payment_status !== "paid") {
    return json({ received: true, pending: true });
  }
  const m = session.metadata ?? {};
  if (!m.job_id || !m.purpose) {
    return json({ received: true, ignored: "no job metadata" });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.rpc("apply_stripe_checkout", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_livemode: event.livemode,
    p_job: m.job_id,
    p_session_id: session.id,
    p_payment_intent_id: session.payment_intent ?? null,
    p_purpose: m.purpose,
    p_amount_minor: Number(m.amount_minor),
    p_fx: Number(m.fx),
    p_amount_dop: Number(m.amount_dop),
    p_commission_dop: Number(m.commission_dop),
    p_pro_payout_dop: Number(m.pro_payout_dop),
    p_tip_dop: 0,
  });
  // A 500 makes Stripe retry. The apply function rolls back on any failure, so a retry is safe.
  if (error) return new Response(error.message, { status: 500 });
  return json({ received: true, result: data });
});
