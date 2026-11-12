import { createClient } from "npm:@supabase/supabase-js@2";

// Sends full refunds for cancelled jobs with a held payment. Called every 15 min by pg_cron through pg_net.
// Each refund gets one Stripe refund. The idempotency key and the refund_id metadata tie a retry to the same
// refund, so a retry after a timeout cannot refund twice.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function stripe(key: string, method: "GET" | "POST", path: string, body?: URLSearchParams, extra: Record<string, string> = {}) {
  const res = await fetch("https://api.stripe.com" + path, {
    method,
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded", ...extra },
    body: body?.toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Error de Stripe.");
  return data;
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

  const results: Array<{ refund_id: string; result: string; stripe_refund_id?: string; detail?: string }> = [];
  for (const r of pending ?? []) {
    try {
      if (!r.payment_intent_id) throw new Error("El pago no tiene intención de pago.");

      // Look for a refund already made for this refund row before creating one. This covers a
      // failed mark on an earlier run, and an idempotency key that Stripe has already expired.
      const listed = await stripe(stripeKey, "GET", `/v1/refunds?payment_intent=${encodeURIComponent(r.payment_intent_id)}&limit=100`);
      const existing = (listed.data ?? []).find(
        (x: { metadata?: Record<string, string>; status?: string }) =>
          x.metadata?.refund_id === r.refund_id && x.status !== "failed" && x.status !== "canceled",
      );

      let refundId: string;
      if (existing) {
        refundId = existing.id;
      } else {
        const params = new URLSearchParams({
          payment_intent: r.payment_intent_id,
          amount: String(r.amount_minor),
          "metadata[refund_id]": r.refund_id,
        });
        const created = await stripe(stripeKey, "POST", "/v1/refunds", params, {
          "Idempotency-Key": "refund_" + r.refund_id,
        });
        refundId = created.id;
      }

      const { data: marked, error: markErr } = await admin.rpc("mark_refund_succeeded", {
        p_refund: r.refund_id,
        p_stripe_refund: refundId,
      });
      if (markErr) throw new Error(markErr.message);
      results.push({ refund_id: r.refund_id, result: String(marked), stripe_refund_id: refundId });
    } catch (e) {
      // The refund stays pending and is retried on the next run.
      results.push({ refund_id: r.refund_id, result: "error", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ claimed: (pending ?? []).length, results });
});
