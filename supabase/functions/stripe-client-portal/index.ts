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

// Opens the Stripe Customer Portal for a client's saved payment methods. Subscriptions are off in this
// configuration. The client can add, remove or change cards and nothing else.
// Creates no Stripe Customer: a client with none gets { url: null, reason: "no_customer" }.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!stripeKey.startsWith("sk_test_")) return json({ error: "Pagos no disponibles." }, 503);
  const configurationId = Deno.env.get("STRIPE_CLIENT_PORTAL_CONFIG_ID") ?? "";
  if (!configurationId.startsWith("bpc_")) return json({ error: "Pagos no disponibles." }, 503);

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
  const { data: row } = await admin
    .from("client_stripe_customers")
    .select("stripe_customer_id")
    .eq("profile_id", user.id)
    .eq("stripe_mode", "test")
    .maybeSingle();
  if (!row) return json({ url: null, reason: "no_customer" });

  const provider = providerFor("stripe", { stripeSecretKey: stripeKey, stripeWebhookSecret: "" });
  try {
    const portal = await provider.createPortalSession({
      customerId: row.stripe_customer_id,
      returnUrl: appUrl + "/cuenta",
      configurationId,
    });
    return json({ url: portal.url });
  } catch (e) {
    return json({ error: "No se pudo abrir tus métodos de pago.", detail: e instanceof Error ? e.message : null }, 502);
  }
});
