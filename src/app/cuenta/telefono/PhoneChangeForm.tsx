"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { normalizePhone } from "@/lib/data/auth";
import { PhoneField } from "@/components/PhoneField";
import { DEFAULT_PHONE_COUNTRY, composePhone, phoneLengthError } from "@/lib/domain/countries";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Step = "phone" | "code";

/**
 * Changes the phone on the CURRENT account. It does not sign in anyone.
 * 1. auth.updateUser({ phone }) sends a code to the NEW number.
 * 2. verifyOtp({ type: "phone_change" }) confirms it; GoTrue then sets auth.users.phone,
 *    and trigger on_auth_user_phone_changed (migration 0043) copies it to profiles.phone.
 * Nothing changes until step 2 succeeds.
 */
export function PhoneChangeForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [local, setLocal] = useState("");
  const phoneInput = composePhone(country, local);
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Ref, not state: a second submit in the same tick must see the lock at once.
  const inFlight = useRef(false);

  async function onSend(e: FormEvent<HTMLFormElement>) {
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
    inFlight.current = true;
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: err } = await supabase.auth.updateUser({ phone: normalized });
      if (err) {
        const taken = (err as { code?: string }).code === "phone_exists";
        setError(taken ? es.phoneChange.taken : es.phoneChange.sendFailed);
        return;
      }
      setPending(normalized);
      setCode("");
      setStep("code");
    } catch {
      setError(es.phoneChange.sendFailed);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current || !pending) return;
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError(es.login.invalidCode);
      return;
    }
    // One code, one attempt: the lock stays closed after success.
    inFlight.current = true;
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: err } = await supabase.auth.verifyOtp({ phone: pending, token: code, type: "phone_change" });
      if (err) {
        setError(es.phoneChange.verifyFailed);
        inFlight.current = false;
        setBusy(false);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError(es.phoneChange.verifyFailed);
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="stack">
        <p className="ok">{es.phoneChange.done}</p>
        <button className="button secondary" type="button" onClick={() => router.push("/cuenta")}>
          {es.phoneChange.back}
        </button>
      </div>
    );
  }

  if (step === "code") {
    return (
      <form className="stack" onSubmit={onVerify}>
        <label className="field">
          {es.phoneChange.code}
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <button className="button" type="submit" disabled={busy}>
          {es.phoneChange.verify}
        </button>
        {error ? <p className="error" role="alert">{error}</p> : null}
      </form>
    );
  }

  return (
    <form className="stack" onSubmit={onSend}>
      <PhoneField
        label={es.phoneChange.newPhone}
        countryLabel={es.phoneField.countryLabel}
        country={country}
        local={local}
        onCountry={setCountry}
        onLocal={setLocal}
      />
      <button className="button" type="submit" disabled={busy}>
        {es.phoneChange.sendCode}
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </form>
  );
}
