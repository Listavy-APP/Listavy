import { createClient } from "npm:@supabase/supabase-js@2";
import { providerFor } from "../_shared/payments/provider.ts";

// Sends full refunds for cancelled jobs with a held payment. Called every 15 min by pg_cron through pg_net.
// Each refund gets one provider refund. The idempotency key and the refund_id metadata tie a retry
// to the same refund, so a retry after a timeout cannot refund twice.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  // Test-only guard, same as the other payment functions. Remove with the live-mode slice.
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!stripeKey.startsWith("sk_test_")) return json({ error: "Pagos no disponibles." }, 503);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Same shared secret as release-payments, kept in Supabase Vault.
  const { data: allowed } = await admin.rpc("verify_release_secret", {
    p_secret: req.headers.get("x-release-secret") ?? "",
  });
  if (allowed !== true) return json({ error: "No autorizado." }, 401);

  const { data: pending, error } = await admin.rpc("claim_pending_refunds", { p_limit: 20 });
  if (error) return json({ error: error.message }, 500);

  const results: Array<{ refund_id: string; result: string; provider_refund_id?: string; detail?: string }> = [];
  for (const r of pending ?? []) {
    try {
      if (!r.payment_intent_id) throw new Error("El pago no tiene referencia de proveedor.");

      // The payment records its provider. The flow calls only the interface.
      const { data: payRow, error: payErr } = await admin.from("payments").select("provider").eq("id", r.payment_id).single();
      if (payErr) throw new Error(payErr.message);
      const provider = providerFor(payRow.provider, { stripeSecretKey: stripeKey, stripeWebhookSecret: "" });

      // Look for a refund already made for this refund row before creating one. This covers a failed
      // mark on an earlier run, and an idempotency key that the provider has already expired.
      let refundId = await provider.findRefund(r.payment_intent_id, r.refund_id);
      if (!refundId) {
        refundId = await provider.createRefund({
          refundId: r.refund_id,
          paymentRef: r.payment_intent_id,
          amountMinor: Number(r.amount_minor),
          currency: provider.currency,
          idempotencyKey: "refund_" + r.refund_id,
        });
      }

      const { data: marked, error: markErr } = await admin.rpc("mark_refund_succeeded", {
        p_refund: r.refund_id,
        p_stripe_refund: refundId,
      });
      if (markErr) throw new Error(markErr.message);
      results.push({ refund_id: r.refund_id, result: String(marked), provider_refund_id: refundId });
    } catch (e) {
      // The refund stays pending and is retried on the next run.
      results.push({ refund_id: r.refund_id, result: "error", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ claimed: (pending ?? []).length, results });
});
