"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** TOTP prompt on every admin sign-in, after the SMS code. */
export function AdminTotpVerify({ factorId }: { factorId: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await createSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (err) {
      setError("El código no es válido. Inténtalo de nuevo.");
      setBusy(false);
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <section className="stack">
      <h1>Verificación de administrador</h1>
      <p className="muted">Escribe el código de 6 dígitos de tu app de autenticación.</p>
      <form className="stack" onSubmit={onSubmit}>
        <label className="field">
          <span>Código</span>
          <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required />
        </label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="button" type="submit" disabled={busy || code.length !== 6}>
          {busy ? "Verificando…" : "Entrar al panel"}
        </button>
      </form>
    </section>
  );
}
