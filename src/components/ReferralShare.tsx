"use client";

import { useEffect, useState } from "react";
import { referralLink, referralShareText, whatsappHref } from "@/lib/domain/referral";
import { es } from "@/lib/i18n/es";

/** Shows the user's code with a WhatsApp share and a copy-link button. The link uses the current origin. */
export function ReferralShare({ code, track }: { code: string; track: "client" | "pro" }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const link = origin ? referralLink(origin, code) : "";
  const text = link ? referralShareText(track, code, link) : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="stack">
      <p>
        <strong>
          {es.referral.yourCode}: {code}
        </strong>
      </p>
      {link ? (
        <div className="actions">
          <a className="button" href={whatsappHref(text)} target="_blank" rel="noopener noreferrer">
            {es.referral.shareWhatsapp}
          </a>
          <button className="button" type="button" onClick={copy}>
            {copied ? es.referral.copied : es.referral.copyLink}
          </button>
        </div>
      ) : null}
    </div>
  );
}
