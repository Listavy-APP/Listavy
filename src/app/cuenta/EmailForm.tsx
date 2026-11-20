"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { callEmailVerification, type EmailVerificationBody } from "@/lib/data/emailVerification";

/**
 * Email is a contact field. The code flow runs in the email-verification Edge Function,
 * which is the only writer of profiles.email (migration 0009 guard).
 */
export function EmailForm(props: { current: string | null; verified: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(body: EmailVerificationBody) {
    return callEmailVerification(createSupabaseBrowserClient(), body);
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
      setChanging(false);
      setEmail("");
      setMessage(es.profile.emailSaved);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const showVerifiedPanel = props.verified && !!props.current && !pending && !changing;
  // Verify Email Early: an unverified address already on the profile gets a one-tap send.
  const oneTap = !!props.current && !props.verified && !pending && !changing;

  async function onSendToCurrent() {
    if (!props.current) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await call({ action: "send", email: props.current });
      setPending(props.current.trim().toLowerCase());
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (showVerifiedPanel) {
    return (
      <div className="stack">
        <div className="stack" role="status">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M7.5 12.5l3 3 6-6.5" />
          </svg>
          <p className="ok" role="status">{es.profile.emailVerifiedTitle}</p>
          <p>
            <a href={`mailto:${props.current}`}>{props.current}</a>
          </p>
        </div>
        <button className="button secondary" type="button" onClick={() => setChanging(true)}>
          {es.profile.emailChange}
        </button>
        {message ? <p className="ok" role="status">{message}</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="stack">
      <p>
        {props.current ?? es.profile.emailNone}{" "}
        {props.current ? (
          <span className="muted">({props.verified ? es.profile.emailVerified : es.profile.emailUnverified})</span>
        ) : null}
      </p>
      {oneTap ? (
        <div className="stack">
          <button className="button" type="button" onClick={onSendToCurrent} disabled={busy}>
            {busy ? es.profile.sendingCode : es.profile.sendCodeTo(props.current ?? "")}
          </button>
          <button className="button secondary" type="button" onClick={() => setChanging(true)} disabled={busy}>
            {es.profile.emailChange}
          </button>
        </div>
      ) : pending ? (
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
      {message ? <p className="ok" role="status">{message}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
