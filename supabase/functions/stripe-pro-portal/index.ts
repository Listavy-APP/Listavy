import { createClient } from "npm:@supabase/supabase-js@2";
import { providerFor } from "../_shared/payments/provider.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Opens the Stripe Customer Portal for a pro on the Pro plan. The portal lets the pro cancel.
// Cancellation ends at period end; Stripe then sends customer.subscription.deleted (kind 'ended').
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

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
    .select("id, plan, plan_stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!pro) return json({ error: "No tienes un perfil de profesional." }, 403);
  if (pro.plan !== "pro" || !pro.plan_stripe_subscription_id) {
    return json({ error: "No tienes un plan Pro activo." }, 409);
  }

  const provider = providerFor("stripe", { stripeSecretKey: stripeKey, stripeWebhookSecret: "" });
  try {
    const customerId = await provider.getSubscriptionCustomerId(pro.plan_stripe_subscription_id);
    const portal = await provider.createPortalSession({
      customerId,
      returnUrl: appUrl + "/pro/estado",
    });
    return json({ url: portal.url });
  } catch (e) {
    return json({ error: "No se pudo abrir la administración del plan.", detail: e instanceof Error ? e.message : null }, 502);
  }
});
