"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { claimReferral, referralProgramEnabled, type ReferralTrack } from "@/lib/data/referrals";
import { REFERRAL_STORAGE_KEY, normalizeReferralCode } from "@/lib/domain/referral";
import { es } from "@/lib/i18n/es";

/**
 * Claims a stored referral code for the signed-in account, once, before the first job or the
 * pro application. Keeps the code while the user is signed out. Renders nothing when the
 * program is off.
 */
export function ClaimReferral({ track }: { track: ReferralTrack }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const code = normalizeReferralCode(window.localStorage.getItem(REFERRAL_STORAGE_KEY));
    if (!code) return;
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      if (!(await referralProgramEnabled(supabase))) return;
      try {
        await claimReferral(supabase, code, track);
        window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
        if (!cancelled) setMsg({ ok: true, text: track === "pro" ? es.referral.claimedPro : es.referral.claimed });
      } catch (e) {
        const text = e instanceof Error ? e.message : "";
        // Not signed in yet: keep the code for the next visit.
        if (/Debes entrar/.test(text)) return;
        window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
        if (!cancelled) setMsg({ ok: false, text: es.referral.claimError + text });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [track]);

  if (!msg) return null;
  return <p className={msg.ok ? "notice" : "error"}>{msg.text}</p>;
}
