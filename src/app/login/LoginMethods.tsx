"use client";

import { useState } from "react";
import { PhoneLoginForm } from "./PhoneLoginForm";
import { EmailLoginForm } from "./EmailLoginForm";
import { es } from "@/lib/i18n/es";

type Method = "phone" | "email";

/** Phone is the default and stays as it was. Email is a second way into the same account. */
export function LoginMethods({ next }: { next: string }) {
  const [method, setMethod] = useState<Method>("phone");
  return (
    <div className="stack">
      <button
        className="button secondary"
        type="button"
        onClick={() => setMethod(method === "phone" ? "email" : "phone")}
      >
        {method === "phone" ? es.login.loginWithEmail : es.login.loginWithPhone}
      </button>
      {method === "phone" ? <PhoneLoginForm next={next} /> : <EmailLoginForm next={next} />}
    </div>
  );
}
