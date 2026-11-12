import { createClient } from "npm:@supabase/supabase-js@2";
import { providerFor } from "../_shared/payments/provider.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!webhookSecret.startsWith("whsec_")) return new Response("webhook not configured", { status: 503 });

  // The provider verifies the signature and normalizes the event. This function never parses provider payloads.
  const provider = providerFor("stripe", { stripeSecretKey: "", stripeWebhookSecret: webhookSecret });
  const raw = await req.text();
  const result = await provider.verifyWebhook(raw, req.headers);

  if (result.kind === "invalid") return new Response("invalid signature", { status: 400 });
  if (result.kind === "ignored") return json({ received: true, ignored: result.reason });
  if (result.kind === "pending") return json({ received: true, pending: true });

  const e = result.event;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.rpc("apply_stripe_checkout", {
    p_event_id: e.eventId,
    p_event_type: e.eventType,
    p_livemode: e.livemode,
    p_job: e.jobId,
    p_session_id: e.providerRef,
    p_payment_intent_id: e.paymentRef,
    p_purpose: e.purpose,
    p_amount_minor: e.amountMinor,
    p_fx: e.fx,
    p_amount_dop: e.amountDop,
    p_commission_dop: e.commissionDop,
    p_pro_payout_dop: e.proPayoutDop,
    p_tip_dop: e.tipDop,
  });
  // A 500 makes Stripe retry. The apply function rolls back on any failure, so a retry is safe.
  if (error) return new Response(error.message, { status: 500 });
  return json({ received: true, result: data });
});
