import Image from "next/image";
import Link from "next/link";
import { es } from "@/lib/i18n/es";
import { HomeIcon } from "@/components/home/HomeIcons";

/**
 * App store badges stay hidden until the store listings are live. Flip to true when they are.
 * The apps are not in the stores yet, so this must remain false for this build.
 */
const APP_BADGES_ENABLED = false;

/**
 * Landing-only footer, light. Two rows: the main band (lockup, links, Instagram) and the bottom bar
 * (copyright, contact, legal). Each link appears once. The shared LegalFooter is hidden on this page.
 */
export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="landing-footer">
      <div className="landing-footer-row landing-footer-main">
        <div className="landing-footer-brand">
          <Link href="/" aria-label="Listavy" className="landing-footer-logo">
            <Image src="/brand/listavy-lockup-horizontal.png" alt="Listavy" width={460} height={149} />
          </Link>
          {APP_BADGES_ENABLED ? (
            <div className="landing-footer-apps">
              <p className="landing-footer-applabel">{es.discover.footerAppLabel}</p>
              <div className="landing-footer-badges">
                <a href="#" aria-label="Download on the App Store">
                  <img src="/badges/app-store.svg" alt="Download on the App Store" height={40} />
                </a>
                <a href="#" aria-label="Get it on Google Play">
                  <img src="/badges/google-play.png" alt="Get it on Google Play" height={40} />
                </a>
              </div>
            </div>
          ) : null}
        </div>

        <nav className="landing-footer-links" aria-label="Listavy">
          <Link href="/buscar">{es.discover.footerSearch}</Link>
          <Link href="/precios">{es.discover.footerPrices}</Link>
          <Link href="/pro/registro">{es.discover.footerForPros}</Link>
          <Link href="/ayuda">{es.discover.footerHelp}</Link>
          <Link href="/acerca">{es.legal.aboutLink}</Link>
        </nav>

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

      <div className="landing-footer-row landing-footer-bar">
        <p className="landing-footer-copy">
          <span>© Listavy {year}</span>
          <span aria-hidden="true">·</span>
          <a href="mailto:hola@listavy.com">hola@listavy.com</a>
        </p>
        <nav className="landing-footer-legal" aria-label={es.discover.footerTerms}>
          <Link href="/terminos">{es.discover.footerTerms}</Link>
          <Link href="/privacidad">{es.discover.footerPrivacy}</Link>
          <Link href="/cancelacion">{es.discover.footerCancel}</Link>
          <Link href="/ayuda" className="landing-footer-guarantee">
            <HomeIcon name="shield-check" size={18} />
            <span>{es.discover.footerGuarantee}</span>
          </Link>
        </nav>
      </div>
    </footer>
  );
}
