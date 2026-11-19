"use client";

import { useRef, useState, type FormEvent } from "react";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { callEmailVerification } from "@/lib/data/emailVerification";
import { dismissEmailPrompt } from "@/lib/data/profiles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_RE = /^\d{6,10}$/;

/**
 * One-time, skippable step after a phone sign-in for an account with no email on file.
 * Fails open: any error in the stamp still sends the user to `next`. Never traps a signed-in user.
 */
export function EmailPromptStep({ next }: { next: string }) {
  const [stage, setStage] = useState<"ask" | "code">("ask");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const inFlight = useRef(false);

  // Stamps the prompt as handled. Errors are swallowed on purpose: the redirect must still happen.
  async function stamp() {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (data.user) await dismissEmailPrompt(supabase, data.user.id);
    } catch {
      // fail open
    }
  }

  async function onLater() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    await stamp();
    window.location.assign(next);
  }

  async function onSend(e: FormEvent<HTMLFormElement>) {
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
      await callEmailVerification(createSupabaseBrowserClient(), { action: "send", email: normalized });
      setSentTo(normalized);
      setCode("");
      setStage("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : es.profile.actionFailed);
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
    inFlight.current = true;
    setBusy(true);
    try {
      await callEmailVerification(createSupabaseBrowserClient(), { action: "verify", code });
      setVerified(true);
      await stamp();
      // A short beat so the success line is readable, then continue. No extra tap.
      window.setTimeout(() => window.location.assign(next), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : es.profile.actionFailed);
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (verified) {
    return (
      <div className="stack" role="status">
        <p className="ok">{es.login.emailPromptVerified}</p>
      </div>
    );
  }

  if (stage === "code") {
    return (
      <form className="stack" onSubmit={onVerify}>
        <h1>{es.login.emailPromptTitle}</h1>
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
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button" type="submit" disabled={busy || !CODE_RE.test(code)}>
          {busy ? es.login.verifying : es.login.verify}
        </button>
        <button className="button secondary" type="button" onClick={onLater} disabled={busy}>
          {es.login.emailPromptLater}
        </button>
      </form>
    );
  }

  return (
    <form className="stack" onSubmit={onSend}>
      <h1>{es.login.emailPromptTitle}</h1>
      <p className="muted">{es.login.emailPromptBody}</p>
      <label className="field">
        <span>{es.login.emailLabel}</span>
        <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy || !email.trim()}>
        {busy ? es.login.sending : es.login.emailPromptSend}
      </button>
      <button className="button secondary" type="button" onClick={onLater} disabled={busy}>
        {es.login.emailPromptLater}
      </button>
    </form>
  );
}
