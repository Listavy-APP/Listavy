"use client";

import { useState } from "react";
import { tipCapDop, tipForPercentDop } from "@/lib/domain/commission";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Pick = "none" | "5" | "10" | "15" | "custom";
const PERCENTS = ["5", "10", "15"] as const;

/**
 * What the homeowner pays, line by line, with an optional tip. The server checks every number again:
 * stripe-checkout validates the tip, and the database refuses an amount that does not match.
 * Tip percentages are of the agreed quote, the same base as the 20% cap.
 */
export function PaySheet(props: { jobId: string; quoteDop: number; creditDop: number; fx: number }) {
  const { quoteDop, creditDop, fx } = props;
  const [pick, setPick] = useState<Pick>("none");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cap = tipCapDop(quoteDop);
  const jobDop = Math.max(0, quoteDop - creditDop);

  let tip = 0;
  let tipError: string | null = null;
  if (pick === "custom") {
    const n = Number(custom || "0");
    if (n > cap) tipError = es.jobs.payTipTooHigh(cap);
    else tip = n;
  } else if (pick !== "none") {
    tip = tipForPercentDop(quoteDop, Number(pick));
  }

  const total = jobDop + tip;
  const usdKnown = Number.isFinite(fx) && fx > 0;
  const usd = usdKnown ? (Math.round((total * 100) / fx) / 100).toFixed(2) : null;

  async function pay() {
    setError(null);
    setBusy(true);
    try {
      const { data, error: fnError } = await createSupabaseBrowserClient().functions.invoke("stripe-checkout", {
        body: { job_id: props.jobId, tip_dop: tip },
      });
      if (fnError || !data?.url) throw new Error(es.jobs.payFailed);
      window.location.href = data.url as string;
    } catch {
      setError(es.jobs.payFailed);
      setBusy(false);
    }
  }

  return (
    <section className="panel stack" aria-labelledby="pay-title">
      <h2 id="pay-title">{es.jobs.paySummary}</h2>
      <ul className="pay-lines">
        <li>
          <span>{es.jobs.payQuote}</span>
          <span>{es.money.dop(quoteDop)}</span>
        </li>
        {creditDop > 0 ? (
          <li className="credit">
            <span>{es.jobs.payCredit}</span>
            <span>−{es.money.dop(creditDop)}</span>
          </li>
        ) : null}
        {tip > 0 ? (
          <li>
            <span>{es.jobs.payTip}</span>
            <span>{es.money.dop(tip)}</span>
          </li>
        ) : null}
        <li className="total">
          <span>{es.jobs.payTotal}</span>
          <span>{es.money.dop(total)}</span>
        </li>
      </ul>
      {usd ? <p className="muted">{es.jobs.payUsd(usd, fx)}</p> : null}

      <div className="stack">
        <span className="field-label">{es.jobs.payTipTitle}</span>
        <div className="chip-wrap">
          <button type="button" className={`chip${pick === "none" ? " on" : ""}`} aria-pressed={pick === "none"} disabled={busy} onClick={() => setPick("none")}>
            {es.jobs.payTipNone}
          </button>
          {PERCENTS.map((p) => (
            <button key={p} type="button" className={`chip${pick === p ? " on" : ""}`} aria-pressed={pick === p} disabled={busy} onClick={() => setPick(p)}>
              {p}%
            </button>
          ))}
          <button type="button" className={`chip${pick === "custom" ? " on" : ""}`} aria-pressed={pick === "custom"} disabled={busy} onClick={() => setPick("custom")}>
            {es.jobs.payTipCustom}
          </button>
        </div>
        {pick === "custom" ? (
          <label className="field">
            <span>{es.jobs.payTipCustomLabel}</span>
            <input inputMode="numeric" value={custom} disabled={busy} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))} />
          </label>
        ) : null}
        {tipError ? <p className="error" role="alert">{tipError}</p> : <p className="muted">{es.jobs.payTipHint}</p>}
      </div>

      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="button" type="button" disabled={busy || tipError !== null || total <= 0} onClick={pay}>
        {busy ? es.jobs.sending : es.jobs.payAmount(total)}
      </button>
      <p className="muted">{es.jobs.payHint}</p>
    </section>
  );
}
