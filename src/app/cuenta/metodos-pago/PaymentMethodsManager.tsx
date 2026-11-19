"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { es } from "@/lib/i18n/es";

type State = "loading" | "empty" | "ready" | "failed";

// Asks the server whether this client has a Stripe Customer. The server creates nothing here.
// With a customer, the button opens the Stripe portal for card management.
export function PaymentMethodsManager() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    createSupabaseBrowserClient()
      .functions.invoke("stripe-client-portal", { body: {} })
      .then(({ data, error: fnError }) => {
        if (!active) return;
        if (fnError) return setState("failed");
        setState(data?.url ? "ready" : "empty");
      });
    return () => {
      active = false;
    };
  }, []);

  async function manage() {
    setError(null);
    setBusy(true);
    const { data, error: fnError } = await createSupabaseBrowserClient().functions.invoke("stripe-client-portal", {
      body: {},
    });
    if (fnError || !data?.url) {
      setError(es.paymentMethods.openFailed);
      setBusy(false);
      return;
    }
    window.location.href = data.url as string;
  }

  if (state === "loading") return <p className="muted">{es.paymentMethods.loading}</p>;
  if (state === "failed") return <p role="alert" className="error">{es.paymentMethods.loadFailed}</p>;
  if (state === "empty") {
    return (
      <div className="stack">
        <b>{es.paymentMethods.emptyTitle}</b>
        <p className="muted">{es.paymentMethods.emptyBody}</p>
      </div>
    );
  }
  return (
    <div className="stack">
      <button className="button" disabled={busy} onClick={manage}>
        {es.paymentMethods.manage}
      </button>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
