"use client";

import { useState } from "react";
import { PhoneLoginForm } from "./PhoneLoginForm";
import { EmailLoginForm } from "./EmailLoginForm";
import { es } from "@/lib/i18n/es";

type Method = "phone" | "email";

/** One card, two ways in. Phone is the default. Email is a second key to the same account. */
export function LoginMethods({ next }: { next: string }) {
  const [method, setMethod] = useState<Method>("phone");
  return (
    <div className="stack">
      <nav className="tabs" aria-label={es.login.methodLabel}>
        <button
          className="tab"
          type="button"
          aria-current={method === "phone" ? "page" : undefined}
          onClick={() => setMethod("phone")}
        >
          {es.login.tabPhone}
        </button>
        <button
          className="tab"
          type="button"
          aria-current={method === "email" ? "page" : undefined}
          onClick={() => setMethod("email")}
        >
          {es.login.tabEmail}
        </button>
      </nav>
      <section className="card stack">
        {method === "phone" ? <PhoneLoginForm next={next} /> : <EmailLoginForm next={next} />}
      </section>
    </div>
  );
}
