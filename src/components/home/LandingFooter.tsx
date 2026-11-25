import Link from "next/link";
import { es } from "@/lib/i18n/es";

/**
 * Landing-only footer. The shared LegalFooter is hidden on this page (globals.css), so every legal link
 * that the shared footer had is kept here: /acerca, /ayuda, /legal, plus the policy pages.
 */
export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-grid">
        <nav aria-label={es.discover.footerServices}>
          <h2>{es.discover.footerServices}</h2>
          <Link href="/servicios">{es.discover.footerServices}</Link>
        </nav>
        <nav aria-label={es.discover.footerListavy}>
          <h2>{es.discover.footerListavy}</h2>
          <Link href="/acerca">{es.legal.aboutLink}</Link>
          <Link href="/ayuda">{es.help.title}</Link>
        </nav>
        <nav aria-label={es.discover.footerLegal}>
          <h2>{es.discover.footerLegal}</h2>
          <Link href="/legal">{es.legal.hubLink}</Link>
          <Link href="/terminos">{es.legal.termsLink}</Link>
          <Link href="/privacidad">{es.legal.privacyLink}</Link>
          <Link href="/cancelacion">{es.legal.cancellationLink}</Link>
        </nav>
        <div>
          <h2>{es.discover.footerContact}</h2>
          <a href="mailto:hola@listavy.com">hola@listavy.com</a>
        </div>
      </div>
      <p className="landing-footer-copy">© Listavy</p>
    </footer>
  );
}
