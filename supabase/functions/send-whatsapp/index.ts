// Listavy · send-whatsapp (0118, item 5b)
// WhatsApp job-event messages for notify_user_whatsapp(). Called only by DB functions that post the vault
// push_secret in x-push-secret (same gate as send-push and send-email).
//
// Rules:
//   * Raw fetch to Twilio's Messages API. No Twilio SDK: npm deps crash the production edge runtime (send-push incident).
//   * Template SIDs and variable order come from platform_settings 'whatsapp_templates', not from this file.
//   * Every attempt writes exactly one notification_log row: sent (Twilio SID in detail) or failed (Twilio error code).
//   * The phone number is never written to the log.
// Requires secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN. The service role reads profiles, jobs, trades and settings.

import { createClient } from "npm:@supabase/supabase-js@2";
import { linkFor, tradeName } from "../_shared/notification-copy.ts";
import {
  buildContentVariables,
  firstName,
  formatDop,
  kindConfig,
  scheduleLabel,
  type WhatsAppConfig,
} from "../_shared/whatsapp-template.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: allowed } = await admin.rpc("verify_push_secret", {
    p_secret: req.headers.get("x-push-secret") ?? "",
  });
  if (allowed !== true) return json({ error: "No autorizado." }, 401);

  const body = (await req.json().catch(() => null)) as {
    user_id?: string; kind?: string; data?: Record<string, unknown>;
  } | null;
  if (!body?.user_id || !body.kind) return json({ error: "Falta usuario o tipo." }, 400);
  const userId = body.user_id;
  const kind = body.kind;
  const data = body.data ?? {};
  const link = linkFor(kind, data);

  const log = (status: string, detail?: string) =>
    admin.from("notification_log").insert({ user_id: userId, channel: "whatsapp", kind, status, detail: detail ?? null, link });

  const { data: profile } = await admin
    .from("profiles")
    .select("phone, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.phone) {
    await log("skipped_no_phone");
    return json({ sent: false, reason: "no_phone" });
  }

  const { data: settingsRow } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "whatsapp_templates")
    .maybeSingle();
  const config = settingsRow?.value as WhatsAppConfig | undefined;
  const entry = config ? kindConfig(config, kind) : null;
  if (!config || !entry) {
    await log("failed", "sin plantilla configurada");
    return json({ error: "Tipo de mensaje sin plantilla." }, 400);
  }

  if (!TWILIO_SID || !TWILIO_TOKEN) {
    await log("failed", "twilio no configurado");
    return json({ error: "El envío de WhatsApp no está configurado." }, 503);
  }

  // Every name and place comes from the records, never from the caller. The caller sends ids and amounts only.
  let trade: string | undefined;
  let zone: string | undefined;
  let proId: string | undefined = typeof data.pro_id === "string" ? data.pro_id : undefined;
  let clientId: string | undefined;
  let municipalityId: string | null = null;
  let scheduledDate: string | null = null;
  let scheduledWindow: string | null = null;
  if (typeof data.job_id === "string") {
    const { data: job } = await admin
      .from("jobs")
      .select("trade, zone, pro_id, homeowner_id, municipality_id, scheduled_date, scheduled_window")
      .eq("id", data.job_id)
      .maybeSingle();
    trade = job?.trade ?? undefined;
    zone = job?.zone ?? undefined;
    proId = proId ?? job?.pro_id ?? undefined;
    clientId = job?.homeowner_id ?? undefined;
    municipalityId = job?.municipality_id ?? null;
    scheduledDate = job?.scheduled_date ?? null;
    scheduledWindow = job?.scheduled_window ?? null;
  }
  let tradeLabel: string | undefined;
  if (trade) {
    const { data: t } = await admin.from("trades").select("pro_label_es, label_es").eq("key", trade).maybeSingle();
    tradeLabel = (t?.pro_label_es as string | null) ?? (t?.label_es as string | undefined) ?? undefined;
  }

  const [{ data: proProfile }, { data: clientProfile }, { data: muni }] = await Promise.all([
    proId ? admin.from("profiles").select("full_name").eq("id", proId).maybeSingle() : Promise.resolve({ data: null }),
    clientId ? admin.from("profiles").select("full_name").eq("id", clientId).maybeSingle() : Promise.resolve({ data: null }),
    municipalityId
      ? admin.from("municipalities").select("display_name").eq("id", municipalityId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const values: Record<string, string> = {
    first_name: firstName(profile.full_name),
    pro_name: proProfile?.full_name?.trim() ?? "",
    client_name: clientProfile?.full_name ? firstName(clientProfile.full_name) : "",
    trade: tradeName(trade, tradeLabel),
    zone: zone ?? "",
    municipality: (muni?.display_name as string | undefined) ?? "",
    schedule: scheduleLabel(scheduledDate, scheduledWindow),
    amount: formatDop(data.amount_dop),
    refund: formatDop(data.refund_dop),
  };
  const contentVariables = buildContentVariables(entry.vars, values);
  if (!contentVariables) {
    await log("failed", "variable sin valor");
    return json({ error: "Faltan datos para la plantilla." }, 422);
  }

  const form = new URLSearchParams({
    To: `whatsapp:${profile.phone}`,
    MessagingServiceSid: config.messaging_service_sid,
    ContentSid: entry.sid,
    ContentVariables: JSON.stringify(contentVariables),
  });

  let res: Response;
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_SID)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
  } catch {
    await log("failed", "error de red");
    return json({ sent: false, reason: "network" }, 502);
  }

  const payload = (await res.json().catch(() => null)) as { sid?: string; code?: number | null } | null;
  if (!res.ok || !payload?.sid) {
    // Log the Twilio error code only. The recipient number stays out of the log.
    await log("failed", `twilio status=${res.status} code=${payload?.code ?? "none"}`);
    return json({ sent: false, reason: "provider" }, 502);
  }

  await log("sent", payload.sid);
  return json({ sent: true });
});
