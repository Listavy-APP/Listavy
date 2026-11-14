// Referral helpers (Invita y gana). Pure functions, no I/O.

/** localStorage key where a ?ref= code waits until the account can claim it. */
export const REFERRAL_STORAGE_KEY = "listavy_ref";

/** Codes are letters and digits, 4 to 16 characters. Anything else is dropped. */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return null;
  return code;
}

/** The link a referrer shares. The app stores the code when the link is opened. */
export function referralLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/?ref=${encodeURIComponent(code)}`;
}

export function referralShareText(track: "client" | "pro", code: string, link: string): string {
  return track === "pro"
    ? `Te invito a Listavy como profesional. Usa mi código ${code} y recibe un mes de Pro gratis: ${link}`
    : `Te invito a Listavy. Usa mi código ${code} y recibe RD$500 de descuento en tu primer trabajo: ${link}`;
}

export function whatsappHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
