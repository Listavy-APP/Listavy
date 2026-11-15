"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * auth-js returns the QR as a raw SVG string prefixed with "data:image/svg+xml;utf-8,".
 * Raw SVG in a data URI breaks on characters such as '#', so re-encode it as base64.
 */
function qrDataUri(raw: string): string {
  const svg = raw.replace(/^data:image\/svg\+xml;utf-8,/, "");
  const bytes = new TextEncoder().encode(svg);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

/** Enroll a TOTP factor (QR code), then verify the first code once. Admins only; the page checks role. */
export function AdminTotpEnroll() {
  const router = useRouter();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Guard against a second run (React Strict Mode runs effects twice in development).
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      // Remove unverified leftovers from an earlier attempt. Errors here are non-fatal.
      const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
      if (listErr) console.warn("listFactors", listErr);
      for (const f of factors?.all ?? []) {
        if (f.factor_type === "totp" && f.status !== "verified") {
          const { error: unErr } = await supabase.auth.mfa.unenroll({ factorId: f.id });
          if (unErr) console.warn("unenroll", unErr);
        }
      }
      // Unique name per attempt, so a leftover factor cannot collide with this one.
      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Listavy admin ${Date.now()}`,
        // The auth server builds the otpauth URI and QR from the issuer. Set it explicitly.
        issuer: "Listavy",
      });
      if (err || !data) {
        console.error("mfa.enroll", err);
        setError(`No se pudo iniciar la configuración: ${err?.message ?? "respuesta vacía"}${err?.code ? ` (${err.code})` : ""}`);
        return;
      }
      setFactorId(data.id);
      setQr(qrDataUri(data.totp.qr_code));
      setSecret(data.totp.secret);
    })();
  }, []);

  async function onVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error: err } = await createSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (err) {
      setError("El código no es válido. Revisa tu app e inténtalo de nuevo.");
      setBusy(false);
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <section className="stack">
      <h1>Activa la verificación en dos pasos</h1>
      <p className="muted">Escanea el código QR con tu app de autenticación (Google Authenticator, Authy o similar). Luego escribe el código de 6 dígitos.</p>
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="Código QR para la app de autenticación" width={200} height={200} />
      ) : null}
      {secret ? (
        <p className="muted">
          {qr ? "¿No puedes escanear? " : "No se pudo mostrar el código QR. "}
          Escribe esta clave en tu app: <code>{secret}</code>
        </p>
      ) : null}
      <form className="stack" onSubmit={onVerify}>
        <label className="field">
          <span>Código de 6 dígitos</span>
          <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required />
        </label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="button" type="submit" disabled={busy || !factorId || code.length !== 6}>
          {busy ? "Verificando…" : "Activar"}
        </button>
      </form>
    </section>
  );
}
