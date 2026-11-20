import type { VerifiedKind } from "@/lib/domain/verifiedIcon";
import { esVerifiedIcon } from "@/lib/i18n/verified-icon";

/**
 * Check-seal next to a pro's name. Cobalt seal, white check. Shown only when verifiedIconKind returns a kind.
 * Accessible name: role="img" with the label. Sized to the name text (see .verified-icon).
 */
export function VerifiedIcon({ kind }: { kind: VerifiedKind }) {
  const label = kind === "company" ? esVerifiedIcon.company : esVerifiedIcon.person;
  return (
    <svg
      className="verified-icon"
      role="img"
      aria-label={label}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{label}</title>
      <path fill="#2563EB" d={SEAL_PATH} />
      <path
        d="M7.5 12.4l3 3 6-6.2"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 12-lobe seal outline, computed once. Lobes alternate between radius 11.2 and 9.6 around the centre. */
const SEAL_PATH = (() => {
  const n = 24;
  const cx = 12;
  const cy = 12;
  const points: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = i % 2 === 0 ? 11.2 : 10.2;
    const a = (Math.PI * 2 * i) / n;
    points.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
})();
