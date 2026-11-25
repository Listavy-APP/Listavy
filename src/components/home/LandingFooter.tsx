import Link from "next/link";
import { es } from "@/lib/i18n/es";
import { HomeIcon } from "@/components/home/HomeIcons";

/**
 * Landing-only footer. The shared LegalFooter is hidden on this page (globals.css), so the legal hub
 * is the single entry point to the policy pages.
 */
export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-grid">
        <nav aria-label={es.discover.footerServices}>
          <h2>{es.discover.footerServices}:</h2>
          <Link href="/buscar">{es.discover.footerServices}</Link>
        </nav>
        <nav aria-label={es.discover.footerListavy}>
          <h2>{es.discover.footerListavy}:</h2>
          <Link href="/acerca">{es.legal.aboutLink}</Link>
          <Link href="/ayuda">{es.help.title}</Link>
        </nav>
        <nav aria-label={es.discover.footerLegal}>
          <h2>{es.discover.footerLegal}:</h2>
          <Link href="/legal">{es.legal.hubLink}</Link>
        </nav>
        <div>
          <h2>{es.discover.footerContact}:</h2>
          <a href="mailto:hola@listavy.com">hola@listavy.com</a>
          <a
            href="https://www.instagram.com/listavy"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="landing-footer-icon"
          >
            <HomeIcon name="instagram" size={20} />
          </a>
        </div>
      </div>
      <p className="landing-footer-copy">© Listavy</p>
    </footer>
  );
}
