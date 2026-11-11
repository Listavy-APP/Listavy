"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Email is a contact field. The code flow runs in the email-verification Edge Function,
 * which is the only writer of profiles.email (migration 0009 guard).
 */
export function EmailForm(props: { current: string | null; verified: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(body: Record<string, string>) {
    const supabase = createSupabaseBrowserClient();
    const { data, error: fnError } = await supabase.functions.invoke("email-verification", { body });
    if (fnError) {
      // Edge Function errors return a JSON body; surface its message when present.
      let msg = "No pudimos completar la acción. Intenta de nuevo.";
      try {
        const ctx = (fnError as { context?: Response }).context;
        if (ctx) msg = ((await ctx.json()) as { error?: string }).error ?? msg;
      } catch {
        // keep the generic message
      }
      throw new Error(msg);
    }
    return data as { ok?: boolean; email?: string; error?: string };
  }

  async function onSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await call({ action: "send", email });
      setPending(email.trim().toLowerCase());
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await call({ action: "verify", code });
      setPending(null);
      setEmail("");
      setMessage(es.profile.emailSaved);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p>
        {props.current ?? es.profile.emailNone}{" "}
        {props.current ? (
          <span className="muted">({props.verified ? es.profile.emailVerified : es.profile.emailUnverified})</span>
        ) : null}
      </p>
      {pending ? (
        <form className="stack" onSubmit={onVerify}>
          <p className="muted">
            {es.profile.codeSentTo} {pending}
          </p>
          <label className="field">
            {es.profile.codeLabel}
            <input
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <button className="button" type="submit" disabled={busy || code.length !== 6}>
            {busy ? es.profile.verifying : es.profile.verifyCode}
          </button>
        </form>
      ) : (
        <form className="stack" onSubmit={onSend}>
          <label className="field">
            {es.profile.emailNew}
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <button className="button" type="submit" disabled={busy || !email.trim()}>
            {busy ? es.profile.sendingCode : es.profile.sendCode}
          </button>
        </form>
      )}
      <p className="muted">{es.profile.emailHint}</p>
      {message ? <p className="ok">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
