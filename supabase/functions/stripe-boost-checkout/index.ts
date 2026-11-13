import { createClient } from "npm:@supabase/supabase-js@2";
import { providerFor } from "../_shared/payments/provider.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Approved prices (spec: 7 days RD$500, 30 days RD$1,500). Set on the server only.
const TIERS: Record<number, { amountDop: number; label: string }> = {
  7: { amountDop: 500, label: "Destacado 7 días (prueba)" },
  30: { amountDop: 1500, label: "Destacado 30 días (prueba)" },
};
// Boosts have no job, so no per-job FX. Same default as jobs (0001_init: 60.0000).
const BOOST_FX_DOP_PER_USD = 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  // Test-only guard, same as stripe-checkout: refuses to run with anything but a test key.
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

  const body = await req.json().catch(() => null);
  const days = body?.duration_days;
  const tier = typeof days === "number" ? TIERS[days] : undefined;
  if (!tier) return json({ error: "Elige 7 o 30 días." }, 400);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: pro } = await admin
    .from("pros")
    .select("id, verification_status, suspended_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!pro) return json({ error: "No tienes un perfil de profesional." }, 403);
  if (pro.verification_status !== "approved") {
    return json({ error: "Tu perfil debe estar aprobado para destacarse." }, 409);
  }
  if (pro.suspended_at) {
    return json({ error: "Tu cuenta está bloqueada. No puedes comprar una promoción." }, 409);
  }

  // One live boost per pro. Rejected here, before any payment. The webhook still records a
  // payment that cannot activate as refund_due, for a race between two checkouts.
  const { data: live } = await admin
    .from("boosts")
    .select("id")
    .eq("pro_id", pro.id)
    .in("status", ["active", "paused"])
    .limit(1)
    .maybeSingle();
  if (live) return json({ error: "Ya tienes una promoción activa." }, 409);

  const provider = providerFor("stripe", { stripeSecretKey: stripeKey, stripeWebhookSecret: "" });
  const amountMinor = Math.round((tier.amountDop * 100) / BOOST_FX_DOP_PER_USD);

  let session;
  try {
    session = await provider.createBoostCheckout({
      proId: pro.id,
      durationDays: days as 7 | 30,
      amountDop: tier.amountDop,
      amountMinor,
      currency: provider.currency,
      fx: BOOST_FX_DOP_PER_USD,
      productName: tier.label,
      successUrl: appUrl + "/pro/estado?destacado=ok",
      cancelUrl: appUrl + "/pro/estado?destacado=cancelado",
    });
  } catch (e) {
    return json({ error: "No se pudo iniciar el pago.", detail: e instanceof Error ? e.message : null }, 502);
  }

  return json({ url: session.url, amount_dop: tier.amountDop, duration_days: days });
});
