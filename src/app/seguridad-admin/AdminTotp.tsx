"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Enroll a TOTP factor (QR code), then verify the first code once. Admins only; the page checks role. */
export function AdminTotpEnroll() {
  const router = useRouter();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      // Remove unverified leftovers from an earlier attempt, then start a fresh enrollment.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.totp ?? []) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Listavy admin" });
      if (err || !data) {
        setError("No se pudo iniciar la configuración. Recarga la página.");
        return;
      }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
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
        <>
          {/* Supabase returns the QR as an SVG data URI. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Código QR para la app de autenticación" width={200} height={200} />
          {secret ? <p className="muted">¿No puedes escanear? Clave manual: <code>{secret}</code></p> : null}
        </>
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
