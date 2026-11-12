"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { normalizePhone, sendWhatsAppCode, verifyWhatsAppCode } from "@/lib/data/auth";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Step = "phone" | "code";

export function PhoneLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phoneInput, setPhoneInput] = useState("+1 ");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref, not state: a second submit in the same tick must see the lock at once.
  const inFlight = useRef(false);

  async function onSendCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    setError(null);
    const normalized = normalizePhone(phoneInput);
    if (!normalized) {
      setError(es.login.invalidPhone);
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
    if (!/^\d{6}$/.test(code)) {
      setError(es.login.invalidCode);
      return;
    }
    if (!phone) return;
    // One OTP can be verified only once. The lock stays closed after success,
    // because the page is leaving; a second verify would fail with otp_expired.
    inFlight.current = true;
    setBusy(true);
    try {
      await verifyWhatsAppCode(createSupabaseBrowserClient(), phone, code);
      setError(null);
      router.push("/cuenta");
      router.refresh();
    } catch {
      inFlight.current = false;
      setError(es.login.verifyFailed);
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
      <label className="field">
        <span>{es.login.phoneLabel}</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+1 809 555 1234"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          required
        />
      </label>
      <p className="muted">{es.login.phoneHint}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy}>
        {busy ? es.login.sending : es.login.sendCode}
      </button>
    </form>
  );
}
