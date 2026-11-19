"use client";

import { useRef, useState, type FormEvent } from "react";
import { sendEmailLoginCode, verifyEmailLoginCode } from "@/lib/data/auth";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Step = "email" | "code";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Auth email codes are 8 digits today. Accept 6 to 10 so a future length change does not lock users out.
const CODE_RE = /^\d{6,10}$/;

/**
 * Sign-in by email code. Works only for an email already verified on an account.
 * No account is created here, and legal acceptance is not asked: this path never signs up.
 */
export function EmailLoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref, not state: a second submit in the same tick must see the lock at once.
  const inFlight = useRef(false);

  async function onSendCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    setError(null);
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setError(es.login.emailInvalid);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await sendEmailLoginCode(createSupabaseBrowserClient(), normalized);
      if (result === "no_account") {
        setError(es.login.emailNoAccount);
        return;
      }
      setSentTo(normalized);
      setCode("");
      setStep("code");
    } catch {
      setError(es.login.sendFailed);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    setError(null);
    if (!CODE_RE.test(code)) {
      setError(es.login.emailInvalidCode);
      return;
    }
    if (!sentTo) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await verifyEmailLoginCode(createSupabaseBrowserClient(), sentTo, code);
      // Full load, so the server reads the new session cookie.
      window.location.assign(next);
    } catch {
      inFlight.current = false;
      setError(es.login.verifyFailed);
      setBusy(false);
    }
  }

  if (step === "code") {
    return (
      <form className="stack" onSubmit={onVerify}>
        <h1>{es.login.emailTitle}</h1>
        <p className="lead">
          {es.login.emailSentTo} {sentTo}
        </p>
        <label className="field">
          <span>{es.login.emailCodeLabel}</span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
        </label>
        <p className="muted">{es.login.emailCodeHint}</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button" type="submit" disabled={busy || !CODE_RE.test(code)}>
          {busy ? es.login.verifying : es.login.verify}
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setStep("email");
            setError(null);
            setCode("");
          }}
        >
          {es.login.changeEmail}
        </button>
      </form>
    );
  }

  return (
    <form className="stack" onSubmit={onSendCode}>
      <h1>{es.login.emailTitle}</h1>
      <label className="field">
        <span>{es.login.emailLabel}</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <p className="muted">{es.login.emailLoginHint}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy || !email.trim()}>
        {busy ? es.login.sending : es.login.emailSendCode}
      </button>
    </form>
  );
}
