import Link from "next/link";
import { es } from "@/lib/i18n/es";

/** Footer on every page. One "Legal" link leads to the hub with all policies. */
export function LegalFooter() {
  return (
    <footer className="legal-footer">
      <Link href="/acerca">{es.legal.aboutLink}</Link>
      <Link href="/ayuda">{es.help.title}</Link>
      <Link href="/legal">{es.legal.hubLink}</Link>
      <span className="muted">© Listavy</span>
    </footer>
  );
}
