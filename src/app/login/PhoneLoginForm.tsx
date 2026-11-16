"use client";

import { useRef, useState, type FormEvent } from "react";
import { normalizePhone, sendWhatsAppCode, verifyWhatsAppCode } from "@/lib/data/auth";
import { PhoneField } from "@/components/PhoneField";
import { DEFAULT_PHONE_COUNTRY, composePhone, phoneLengthError } from "@/lib/domain/countries";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { recordLegalAcceptance } from "@/lib/data/legal";
import { AcceptLegal } from "@/components/AcceptLegal";

type Step = "phone" | "code";

export function PhoneLoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<Step>("phone");
  const [accepted, setAccepted] = useState(false);
  const [country, setCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [local, setLocal] = useState("");
  const phoneInput = composePhone(country, local);
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref, not state: a second submit in the same tick must see the lock at once.
  const inFlight = useRef(false);
  // Set once the code is verified. A one-time code cannot be verified twice, so a retry after a
  // failed acceptance write must skip verification and only repeat the write.
  const verified = useRef(false);

  async function onSendCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    setError(null);
    const lengthError = phoneLengthError(country, local);
    if (lengthError) {
      setError(lengthError);
      return;
    }
    const normalized = normalizePhone(phoneInput);
    if (!normalized) {
      setError(es.login.invalidPhone);
      return;
    }
    if (!accepted) {
      setError(es.legal.acceptRequired);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      await sendWhatsAppCode(createSupabaseBrowserClient(), normalized);
      setPhone(normalized);
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
    if (!verified.current && !/^\d{6}$/.test(code)) {
      setError(es.login.invalidCode);
      return;
    }
    if (!phone) return;
    // One OTP can be verified only once. The lock stays closed after success,
    // because the page is leaving; a second verify would fail with otp_expired.
    inFlight.current = true;
    setBusy(true);
    // Guard: if the page has not left after 10 s, release the form instead of hanging.
    const guard = window.setTimeout(() => {
      inFlight.current = false;
      setError(verified.current ? es.login.acceptanceFailed : es.login.verifyFailed);
      setBusy(false);
    }, 10000);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!verified.current) {
        await verifyWhatsAppCode(supabase, phone, code);
        verified.current = true;
      }
      // Recorded before leaving, so the acceptance row exists for the account that was just created or entered.
      await recordLegalAcceptance(supabase, ["terms", "privacy"]);
      setError(null);
      // Full load, so the server reads the new session cookie. Client router state can be stale.
      window.location.assign(next);
    } catch {
      window.clearTimeout(guard);
      inFlight.current = false;
      // Code already accepted: the session exists, only the acceptance record failed. Say so.
      setError(verified.current ? es.login.acceptanceFailed : es.login.verifyFailed);
      setBusy(false);
    }
  }

  if (step === "code") {
    return (
      <form className="stack" onSubmit={onVerify}>
        <h1>{es.login.title}</h1>
        <p className="lead">
          {es.login.sentTo} {phone}
        </p>
        <label className="field">
          <span>{es.login.codeLabel}</span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
        </label>
        <p className="muted">{es.login.codeHint}</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button" type="submit" disabled={busy}>
          {busy ? es.login.verifying : es.login.verify}
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setStep("phone");
            setError(null);
            setCode("");
          }}
        >
          {es.login.changeNumber}
        </button>
      </form>
    );
  }

  return (
    <form className="stack" onSubmit={onSendCode}>
      <h1>{es.login.title}</h1>
      <PhoneField
        label={es.login.phoneLabel}
        countryLabel={es.phoneField.countryLabel}
        country={country}
        local={local}
        onCountry={setCountry}
        onLocal={setLocal}
      />
      <p className="muted">{es.phoneField.hint}</p>
      <AcceptLegal kind="client" checked={accepted} onChange={setAccepted} />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy}>
        {busy ? es.login.sending : es.login.sendCode}
      </button>
    </form>
  );
}
