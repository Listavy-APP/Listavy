import Link from "next/link";
import { es } from "@/lib/i18n/es";

/** Links to the legal pages. Static, so it is safe in the root layout. */
export function LegalFooter() {
  return (
    <footer className="legal-footer">
      <Link href="/acerca">{es.legal.aboutLink}</Link>
      <Link href="/privacidad">{es.legal.privacyLink}</Link>
      <Link href="/terminos">{es.legal.termsLink}</Link>
      <Link href="/cookies">{es.legal.cookiesLink}</Link>
      <Link href="/cancelacion">{es.legal.cancellationLink}</Link>
      <Link href="/comunidad">{es.legal.communityLink}</Link>
      <Link href="/pro/terminos">{es.legal.proTermsLink}</Link>
    </footer>
  );
}
