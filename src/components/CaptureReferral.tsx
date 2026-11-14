"use client";

import { useEffect } from "react";
import { REFERRAL_STORAGE_KEY, normalizeReferralCode } from "@/lib/domain/referral";

/** Keeps a ?ref= code from any page until an account can claim it. Renders nothing. */
export function CaptureReferral() {
  useEffect(() => {
    const code = normalizeReferralCode(new URLSearchParams(window.location.search).get("ref"));
    if (code) window.localStorage.setItem(REFERRAL_STORAGE_KEY, code);
  }, []);
  return null;
}
