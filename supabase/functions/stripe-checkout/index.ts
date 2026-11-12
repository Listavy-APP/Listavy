import { createClient } from "npm:@supabase/supabase-js@2";
import { splitPayment } from "./commission.ts";
import { providerFor } from "../_shared/payments/provider.ts";

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

  // Test-only guard: this function refuses to run with anything but a test key.
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!stripeKey.startsWith("sk_test_")) {
    return json({ error: "Pagos no disponibles." }, 503);
  }
  const appUrl = Deno.env.get("APP_URL") ?? "https://listavy-listavy.vercel.app";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // The caller must be signed in. The JWT identifies them.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "No autorizado." }, 401);

  const body = await req.json().catch(() => null);
  const jobId = body?.job_id;
  if (typeof jobId !== "string") return json({ error: "Falta el trabajo." }, 400);
  // Optional tip in whole pesos. Absent means no tip. Validated against the job amount below.
  const tipRaw = body?.tip_dop ?? 0;
  if (typeof tipRaw !== "number" || !Number.isInteger(tipRaw) || tipRaw < 0) {
    return json({ error: "La propina debe ser un número entero de pesos." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: job } = await admin
    .from("jobs")
    .select("id, homeowner_id, pro_id, trade, status, payment_status, job_type, approved_quote_id, credit_from_job_id, fx_rate_dop_per_usd, payment_provider")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return json({ error: "Trabajo no encontrado." }, 404);
  if (job.homeowner_id !== user.id) return json({ error: "No autorizado." }, 403);
  if (job.status !== "accepted" || job.payment_status !== "unpaid") {
    return json({ error: "El trabajo no está listo para pago." }, 409);
  }
  if (!job.approved_quote_id) return json({ error: "El trabajo no tiene cotización aprobada." }, 409);

  const { data: quote } = await admin.from("quotes").select("amount_dop").eq("id", job.approved_quote_id).single();
  const quoteDop: number = quote.amount_dop;

  // Diagnostic credit (D13): a repair is charged the quote minus the paid diagnostic.
  let creditDop = 0;
  if (job.credit_from_job_id) {
    const { data: credit } = await admin
      .from("payments")
      .select("amount_dop")
      .eq("job_id", job.credit_from_job_id)
      .eq("purpose", "diagnostic")
      .in("status", ["held", "released"])
      .limit(1)
      .maybeSingle();
    if (!credit) return json({ error: "El diagnóstico no tiene pago registrado." }, 409);
    creditDop = credit.amount_dop;
  }

  const isDiagnostic = job.job_type === "diagnostic";

  const { data: pro } = await admin.from("pros").select("plan").eq("id", job.pro_id).single();
  let split;
  try {
    split = splitPayment({
      quoteDop,
      creditDop,
      tipDop: tipRaw,
      kind: isDiagnostic ? "diagnostic" : "repair",
      plan: pro.plan,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "No se pudo calcular el pago." }, 400);
  }

  const fx = Number(job.fx_rate_dop_per_usd);
  const provider = providerFor(job.payment_provider, { stripeSecretKey: stripeKey, stripeWebhookSecret: "" });
  const amountMinor = Math.round((split.amountDop * 100) / fx);

  let session;
  try {
    session = await provider.createCheckout({
      jobId: job.id,
      purpose: isDiagnostic ? "diagnostic" : "job",
      productName: isDiagnostic ? "Diagnóstico Listavy (prueba)" : "Reparación Listavy (prueba)",
      amountMinor,
      currency: provider.currency,
      fx,
      amountDop: split.amountDop,
      commissionDop: split.commissionDop,
      proPayoutDop: split.proPayoutDop,
      tipDop: split.tipDop,
      successUrl: appUrl + "/trabajos/" + job.id + "?pago=ok",
      cancelUrl: appUrl + "/trabajos/" + job.id + "?pago=cancelado",
    });
  } catch (e) {
    return json({ error: "No se pudo iniciar el pago.", detail: e instanceof Error ? e.message : null }, 502);
  }

  return json({
    url: session.url,
    charged_dop: split.chargedDop,
    tip_dop: split.tipDop,
    amount_dop: split.amountDop,
    commission_dop: split.commissionDop,
  });
});
