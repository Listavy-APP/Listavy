import { currentVerifications } from "@/lib/data/verification";
import { companyVerified, identityVerified, type CurrentStage } from "@/lib/domain/verification";
import { esVerification as t } from "@/lib/i18n/verification";
import type { SupabaseClient } from "@supabase/supabase-js";

function date(iso: string) {
  return new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santo_Domingo" });
}

function label(c: CurrentStage): string | null {
  const d = date(c.verified_at);
  switch (c.stage) {
    case "identity": return null; // Shown once as a whole, below, when the selfie is also approved.
    case "buena_conducta": return t.badge.buena_conducta(d);
    case "sie_licence": return t.badge.sie_licence(d);
    case "infotep_certificate": return t.badge.infotep_certificate(d);
    case "insurance": return c.expires_at ? t.badge.insurance(d, date(`${c.expires_at}T00:00:00Z`)) : null;
    default: return null; // Company entity, registry and representative roll up into the company badge.
  }
}

/** Dated, narrow badges for a pro's approved, unexpired stages. Renders nothing when none apply. */
export async function VerificationBadges({
  supabase,
  proId,
  isCompany,
}: {
  supabase: SupabaseClient;
  proId: string;
  isCompany: boolean;
}) {
  const current = await currentVerifications(supabase, proId);
  const lines = current.map(label).filter((l): l is string => l !== null);
  const identity = current.find((c) => c.stage === "identity");
  if (identity && identityVerified(current)) lines.unshift(t.badge.identity(date(identity.verified_at)));
  const company = isCompany && companyVerified(current);
  if (lines.length === 0 && !company) return null;
  return (
    <div className="pro-badges stack">
      {company ? (
        <>
          <span className="badge">{t.badge.company(date(current.map((c) => c.verified_at).sort().at(-1) ?? new Date().toISOString()))}</span>
          <p className="muted">{t.badge.companyDisclosure}</p>
        </>
      ) : null}
      {lines.map((l) => (
        <span key={l} className="badge">{l}</span>
      ))}
    </div>
  );
}
