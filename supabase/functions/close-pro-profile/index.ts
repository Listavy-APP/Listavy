// Listavy · close-pro-profile
// A signed-in pro closes their pro profile. Steps, in this order:
//   1. Read the pro row. Already closed: return ok (safe retry).
//   2. pro_close_blockers (service role): refuse while jobs are open, money is not released,
//      a dispute is open, or a recovery is owed. The messages match the database.
//   3. Cancel the Pro plan subscription now, if there is one. No proration, no invoice, no refund.
//      Stripe first: if this fails, nothing is closed and the pro keeps the plan and profile.
//   4. close_pro_profile (service role): re-checks the blockers under a row lock, withdraws pending
//      quotes, sets closed_at, and returns the account to a client role. Idempotent.
// Connect accounts and payment records are not touched. History stays. See the 0082 migration.
// Test mode only (sk_test_), like the other Pro plan functions.

import { createClient } from "npm:@supabase/supabase-js@2";
import { providerFor } from "../_shared/payments/provider.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Same text as the database. Only the first blocker is shown.
const BLOCKER_MESSAGES: Record<string, string> = {
  open_jobs: "Tienes trabajos abiertos. Termínalos antes de cerrar tu perfil.",
  money_owed: "Tienes pagos pendientes de liberar. Espera a que se liberen antes de cerrar tu perfil.",
  open_dispute: "Tienes una disputa abierta. Espera a que se resuelva antes de cerrar tu perfil.",
  recovery_owed: "Tienes un saldo pendiente con Listavy. Págalo antes de cerrar tu perfil.",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!stripeKey.startsWith("sk_test_")) return json({ error: "Pagos no disponibles." }, 503);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: "Debes entrar primero." }, 401);
  const proId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: pro, error: proError } = await admin
    .from("pros")
    .select("id, closed_at, plan_stripe_subscription_id")
    .eq("id", proId)
    .maybeSingle();
  if (proError) return json({ error: "No pudimos leer tu perfil. Intenta de nuevo." }, 500);
  if (!pro) return json({ error: "No tienes un perfil profesional." }, 404);
  if (pro.closed_at) return json({ ok: true, already_closed: true });

  const { data: blockers, error: blockError } = await admin.rpc("pro_close_blockers", { p_pro: proId });
  if (blockError) return json({ error: "No pudimos revisar tu perfil. Intenta de nuevo." }, 500);
  const list = (blockers ?? []) as string[];
  if (list.length > 0) {
    return json({ error: BLOCKER_MESSAGES[list[0]] ?? "No puedes cerrar tu perfil todavía." }, 409);
  }

  let subscriptionCancelled = false;
  if (pro.plan_stripe_subscription_id) {
    const provider = providerFor("stripe", { stripeSecretKey: stripeKey, stripeWebhookSecret: "" });
    try {
      await provider.cancelProPlanSubscription(pro.plan_stripe_subscription_id);
      subscriptionCancelled = true;
    } catch {
      return json({ error: "No pudimos cancelar tu suscripción. Tu perfil sigue abierto. Intenta de nuevo." }, 502);
    }
  }

  const { error: closeError } = await admin.rpc("close_pro_profile", { p_pro: proId });
  if (closeError) {
    // The subscription may already be cancelled. A retry sees it as already cancelled and continues.
    const note = subscriptionCancelled ? " Tu suscripción ya se canceló; vuelve a intentarlo." : "";
    return json({ error: closeError.message + note }, 409);
  }

  return json({ ok: true, subscription_cancelled: subscriptionCancelled });
});
