import { createClient } from "npm:@supabase/supabase-js@2";
import { providerFor } from "../_shared/payments/provider.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Approved price: RD$2,950 per month. Set on the server only. Must match apply_pro_plan_event.
const PRO_PLAN_DOP = 2950;
const PRO_PLAN_LABEL = "Plan Pro mensual (prueba)";
// Same default FX as the boost checkout. Stripe charges in USD in test mode. See report.
const PRO_PLAN_FX_DOP_PER_USD = 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  // Test-only guard, same as the other payment functions.
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!stripeKey.startsWith("sk_test_")) return json({ error: "Pagos no disponibles." }, 503);

  const appUrl = Deno.env.get("APP_URL") ?? "https://listavy-listavy.vercel.app";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "No autorizado." }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: pro } = await admin
    .from("pros")
    .select("id, plan, verification_status, suspended_at, plan_stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!pro) return json({ error: "No tienes un perfil de profesional." }, 403);
  if (pro.verification_status !== "approved") {
    return json({ error: "Tu perfil debe estar aprobado para activar el plan Pro." }, 409);
  }
  if (pro.suspended_at) {
    return json({ error: "Tu cuenta está bloqueada. No puedes activar el plan Pro." }, 409);
  }
  if (pro.plan === "pro" || pro.plan_stripe_subscription_id) {
    return json({ error: "Ya tienes el plan Pro." }, 409);
  }

  const provider = providerFor("stripe", { stripeSecretKey: stripeKey, stripeWebhookSecret: "" });
  const amountMinor = Math.round((PRO_PLAN_DOP * 100) / PRO_PLAN_FX_DOP_PER_USD);

  let session;
  try {
    session = await provider.createProPlanCheckout({
      proId: pro.id,
      amountDop: PRO_PLAN_DOP,
      amountMinor,
      currency: provider.currency,
      fx: PRO_PLAN_FX_DOP_PER_USD,
      productName: PRO_PLAN_LABEL,
      successUrl: appUrl + "/pro/estado?plan=ok",
      cancelUrl: appUrl + "/pro/estado?plan=cancelado",
    });
  } catch (e) {
    return json({ error: "No se pudo iniciar el pago.", detail: e instanceof Error ? e.message : null }, 502);
  }

  return json({ url: session.url, amount_dop: PRO_PLAN_DOP });
});
