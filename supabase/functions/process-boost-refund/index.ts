import { createClient } from "npm:@supabase/supabase-js@2";
import { providerFor } from "../_shared/payments/provider.ts";

// Admin-only. Refunds one boost. The amount comes from boost_refund_dop (DB), never from the client.
// Retry-safe: the refund id is the boost id, so Stripe and the mark step see one refund per boost.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  // Test-only guard, same as the other payment functions.
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!stripeKey.startsWith("sk_test_")) return json({ error: "Pagos no disponibles." }, 503);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // The caller must be an admin. The database checks it again inside boost_refund_dop.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "No autorizado." }, 401);
  const { data: isAdmin } = await userClient.rpc("is_admin");
  if (isAdmin !== true) return json({ error: "No autorizado." }, 403);

  const body = await req.json().catch(() => null);
  const boostId = body?.boost_id;
  if (typeof boostId !== "string") return json({ error: "Falta el destacado." }, 400);

  const { data: refundDop, error: dopErr } = await userClient.rpc("boost_refund_dop", { p_boost: boostId });
  if (dopErr) return json({ error: dopErr.message }, 409);
  if (typeof refundDop !== "number" || refundDop <= 0) {
    return json({ error: "No hay días por reembolsar." }, 409);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: boost } = await admin
    .from("boosts")
    .select("id, amount_dop, amount_minor, stripe_payment_intent_id, status")
    .eq("id", boostId)
    .maybeSingle();
  if (!boost) return json({ error: "Destacado no encontrado." }, 404);
  if (!boost.stripe_payment_intent_id || !boost.amount_minor) {
    return json({ error: "El pago no tiene referencia de proveedor." }, 409);
  }

  // Pro-rata in minor units, rounded down so the refund never exceeds what was paid.
  const refundMinor = Math.floor((Number(boost.amount_minor) * refundDop) / boost.amount_dop);
  if (refundMinor <= 0) return json({ error: "El reembolso es demasiado pequeño." }, 409);

  const provider = providerFor("stripe", { stripeSecretKey: stripeKey, stripeWebhookSecret: "" });
  let stripeRefundId: string;
  try {
    // A refund already made for this boost (an earlier run that timed out) is reused, not repeated.
    const existing = await provider.findRefund(boost.stripe_payment_intent_id, boost.id);
    stripeRefundId =
      existing ??
      (await provider.createRefund({
        refundId: boost.id,
        paymentRef: boost.stripe_payment_intent_id,
        amountMinor: refundMinor,
        currency: provider.currency,
        idempotencyKey: "boost_refund_" + boost.id,
      }));
  } catch (e) {
    return json({ error: "Stripe no aceptó el reembolso.", detail: e instanceof Error ? e.message : null }, 502);
  }

  const { data: marked, error: markErr } = await admin.rpc("mark_boost_refunded", {
    p_boost: boost.id,
    p_refund_dop: refundDop,
    p_stripe_refund: stripeRefundId,
  });
  if (markErr) return json({ error: "Reembolso hecho en Stripe, pero no se pudo registrar. Avisa al equipo técnico.", refund_id: stripeRefundId }, 500);

  return json({ result: marked, refund_dop: refundDop, refund_minor: refundMinor, stripe_refund_id: stripeRefundId });
});
