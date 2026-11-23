"use client";

import { useRef, useState, type FormEvent } from "react";
import { normalizePhone, sendWhatsAppCode, verifyWhatsAppCode } from "@/lib/data/auth";
import { PhoneField } from "@/components/PhoneField";
import { DEFAULT_PHONE_COUNTRY, composePhone, phoneLengthError } from "@/lib/domain/countries";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { recordLegalAcceptance } from "@/lib/data/legal";
import { AcceptLegal } from "@/components/AcceptLegal";
import { getCurrentProfile } from "@/lib/data/profiles";
import { EmailPromptStep } from "./EmailPromptStep";

/** True only for an account with no email on file that has not dismissed the prompt. Fails open. */
async function emailPromptNeeded(supabase: ReturnType<typeof createSupabaseBrowserClient>): Promise<boolean> {
  try {
    const profile = await getCurrentProfile(supabase);
    return !!profile && !profile.email && !profile.email_prompt_dismissed_at;
  } catch {
    return false;
  }
}

type Step = "phone" | "code";

const WA_GLYPH = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 16 16" fill="#25D366" aria-hidden="true" focusable="false"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931a6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg>`;
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
  const [phoneError, setPhoneError] = useState<string | null>(null);
  // Ref, not state: a second submit in the same tick must see the lock at once.
  const inFlight = useRef(false);
  // Set once the code is verified. A one-time code cannot be verified twice, so a retry after a
  // failed acceptance write must skip verification and only repeat the write.
  const verified = useRef(false);
  // Set after the acceptance is recorded, when the one-time email prompt must be shown before leaving.
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);

  async function onSendCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    setError(null);
    setPhoneError(null);
    const lengthError = phoneLengthError(country, local);
    if (lengthError) {
      setPhoneError(lengthError);
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
      // One-time email step, only when no email is on file. Acceptance is already recorded above.
      if (await emailPromptNeeded(supabase)) {
        window.clearTimeout(guard);
        inFlight.current = false;
        setBusy(false);
        setShowEmailPrompt(true);
        return;
      }
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

  if (showEmailPrompt) {
    return <EmailPromptStep next={next} />;
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
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "phone-otp-error" : undefined}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
        </label>
        <p className="muted">{es.login.codeHint}</p>
        {error && <p id="phone-otp-error" className="error" role="alert">{error}</p>}
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
        error={phoneError}
        errorId="phone-length-error"
      />
      <p className="muted">{es.phoneField.hint}</p>
      <AcceptLegal kind="client" checked={accepted} onChange={setAccepted} />
      {error && <p id="phone-send-error" className="error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy} aria-label={busy ? undefined : es.login.sendCodeWhatsApp}>
        {busy ? es.login.sending : (
          <>
            {es.login.sendCode}
            <span style={{ marginLeft: 6, verticalAlign: "middle", display: "inline-flex" }} dangerouslySetInnerHTML={{ __html: WA_GLYPH }} />
          </>
        )}
      </button>
    </form>
  );
}
