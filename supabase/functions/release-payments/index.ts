import { createClient } from "npm:@supabase/supabase-js@2";
import { providerFor } from "../_shared/payments/provider.ts";

// Pays pros 24 h after approval. Called every 15 min by pg_cron through pg_net.
// Each payment gets one provider transfer. The idempotency key is the payment id, so a retry
// after a timeout returns the same transfer and cannot pay twice.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  // Test-only guard, same as stripe-checkout. Remove with the live-mode slice.
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!stripeKey.startsWith("sk_test_")) return json({ error: "Pagos no disponibles." }, 503);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Shared secret from pg_cron, kept in Supabase Vault. Anyone without it gets nothing.
  const { data: allowed } = await admin.rpc("verify_release_secret", {
    p_secret: req.headers.get("x-release-secret") ?? "",
  });
  if (allowed !== true) return json({ error: "No autorizado." }, 401);

  const { data: due, error } = await admin.rpc("claim_due_payments", { p_limit: 20 });
  if (error) return json({ error: error.message }, 500);

  const results: Array<{ payment_id: string; result: string; transfer_id?: string; detail?: string }> = [];
  for (const p of due ?? []) {
    if (!p.pro_account_id) {
      results.push({ payment_id: p.payment_id, result: "skipped_no_account" });
      continue;
    }
    try {
      // Recovery netting already ran in claim_due_payments. A zero net means the whole payout went to
      // recovery. No transfer is made, and the payment is marked released with no transfer id.
      if (Number(p.net_payout_dop) <= 0) {
        const { data: markedZero, error: zeroErr } = await admin.rpc("mark_payment_released", {
          p_payment: p.payment_id,
          p_transfer: null,
        });
        if (zeroErr) throw new Error(zeroErr.message);
        results.push({ payment_id: p.payment_id, result: String(markedZero) });
        continue;
      }

      // The payment records its provider. The flow calls only the interface.
      const { data: payRow, error: payErr } = await admin.from("payments").select("provider").eq("id", p.payment_id).single();
      if (payErr) throw new Error(payErr.message);
      const provider = providerFor(payRow.provider, { stripeSecretKey: stripeKey, stripeWebhookSecret: "" });

      // The transfer is tied to the original charge, so it does not wait on the platform balance.
      const chargeId = await provider.chargeIdFor(p.payment_intent_id);

      // Look for a transfer already made for this payment before creating one. This works after the
      // provider has expired the idempotency key, and after a failed mark on an earlier run.
      let transferId = await provider.findTransfer(p.job_id, p.payment_id);
      if (!transferId) {
        // Pro's net share of the charge, in minor units, after recovery netting. Commission is what is left.
        const payoutMinor = Math.round((Number(p.amount_minor) * p.net_payout_dop) / p.amount_dop);
        transferId = await provider.createTransfer({
          paymentId: p.payment_id,
          jobId: p.job_id,
          chargeId,
          destination: p.pro_account_id,
          amountMinor: payoutMinor,
          currency: provider.currency,
          idempotencyKey: "release_" + p.payment_id,
        });
      }

      const { data: marked, error: markErr } = await admin.rpc("mark_payment_released", {
        p_payment: p.payment_id,
        p_transfer: transferId,
      });
      if (markErr) throw new Error(markErr.message);
      results.push({ payment_id: p.payment_id, result: String(marked), transfer_id: transferId });
    } catch (e) {
      // The payment stays held and is retried on the next run.
      results.push({ payment_id: p.payment_id, result: "error", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ claimed: (due ?? []).length, results });
});
