// Listavy · email-verification
// Two actions, both require a signed-in user (phone OTP session):
//   { action: "send",   email }  -> emails a 6-digit code (Resend), stores its hash, 15 min, 5 sends per 10 min
//   { action: "verify", code }   -> checks the newest unused code; 3 wrong attempts lock it;
//                                   on success writes profiles.email and email_verified_at (service role).
// The email is never a login method. Phone OTP stays the only login.
// NOT DEPLOYED: requires RESEND_API_KEY and a verified sending domain (listavy.com).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Listavy <no-reply@listavy.com>";

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const MAX_SENDS_PER_10_MIN = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sixDigitCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: "Debes entrar primero." }, 401);
  const userId = userData.user.id;

  // Service role: bypasses RLS. The guard trigger allows it because auth.uid() is null here.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: { action?: string; email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Solicitud no válida." }, 400);
  }

  if (body.action === "send") {
    const email = (body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json({ error: "Escribe un correo válido." }, 400);

    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("email_verifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_SENDS_PER_10_MIN) {
      return json({ error: "Espera unos minutos antes de pedir otro código." }, 429);
    }

    const code = sixDigitCode();
    if (!RESEND_KEY) return json({ error: "El envío de correos no está configurado." }, 503);

    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [email],
        subject: "Tu código de verificación de Listavy",
        text: `Tu código es ${code}. Vence en 15 minutos. Si no lo pediste, ignora este correo.`,
      }),
    });
    if (!sent.ok) return json({ error: "No pudimos enviar el código. Intenta de nuevo." }, 502);

    // Invalidate older unused codes for this user, then store the new one (hashed).
    await admin
      .from("email_verifications")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("used_at", null);

    const { error } = await admin.from("email_verifications").insert({
      user_id: userId,
      email,
      code_hash: await sha256Hex(`${userId}:${code}`),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });
    if (error) return json({ error: "No pudimos guardar el código. Intenta de nuevo." }, 500);
    return json({ ok: true, email });
  }

  if (body.action === "verify") {
    const code = (body.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) return json({ error: "El código tiene 6 dígitos." }, 400);

    const { data: row } = await admin
      .from("email_verifications")
      .select("id, email, code_hash, attempts, expires_at")
      .eq("user_id", userId)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row) return json({ error: "El código venció. Pide uno nuevo." }, 400);
    if (row.attempts >= MAX_ATTEMPTS) return json({ error: "Demasiados intentos. Pide un código nuevo." }, 429);

    const ok = (await sha256Hex(`${userId}:${code}`)) === row.code_hash;
    if (!ok) {
      await admin.from("email_verifications").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      return json({ error: "El código no es correcto." }, 400);
    }

    const now = new Date().toISOString();
    await admin.from("email_verifications").update({ used_at: now }).eq("id", row.id);
    const { error } = await admin
      .from("profiles")
      .update({ email: row.email, email_verified_at: now })
      .eq("id", userId);
    if (error) return json({ error: "No pudimos guardar tu correo." }, 500);
    return json({ ok: true, email: row.email });
  }

  return json({ error: "Acción no válida." }, 400);
});
