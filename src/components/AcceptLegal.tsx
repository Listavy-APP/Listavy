import Link from "next/link";
import { es } from "@/lib/i18n/es";

/**
 * Required checkbox for sign-up. Lists the documents the user accepts, each linked.
 * The caller must not submit until `checked` is true.
 */
export function AcceptLegal({
  kind,
  checked,
  disabled,
  onChange,
}: {
  kind: "client" | "pro";
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const client = kind === "client";
  return (
    <label className="check-row">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {client ? es.legal.acceptClientLead : es.legal.acceptProLead}{" "}
        {client ? (
          <>
            <Link href="/terminos">{es.legal.termsLink}</Link> {es.legal.acceptClientJoiner}{" "}
            <Link href="/privacidad">{es.legal.privacyLink}</Link>
          </>
        ) : (
          <>
            <Link href="/pro/terminos">{es.legal.proTermsLink}</Link> {es.legal.acceptProJoiner}{" "}
            <Link href="/comunidad">{es.legal.communityLink}</Link>
          </>
        )}
        .
      </span>
    </label>
  );
}
