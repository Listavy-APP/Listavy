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
 * Landing-only footer, light (Thumbtack pattern). The shared LegalFooter is hidden on this page.
 * Every link here points to an existing route.
 */
export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="landing-footer">
      <div className="landing-footer-grid">
        <div className="landing-footer-brand">
          <Link href="/" aria-label="Listavy" className="landing-footer-logo">
            <Image src="/brand/listavy-lockup-horizontal.png" alt="Listavy" width={460} height={149} />
          </Link>
          <p className="landing-footer-tagline">{es.discover.footerTagline}</p>
          <a className="landing-footer-mail" href="mailto:hola@listavy.com">hola@listavy.com</a>
          <div className="landing-footer-social">
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

        <nav aria-label={es.discover.footerClients}>
          <h2>{es.discover.footerClients}</h2>
          <Link href="/buscar">{es.discover.footerSearch}</Link>
          <Link href="/#como-funciona">{es.discover.footerHow}</Link>
          <Link href="/precios">{es.discover.footerPrices}</Link>
          <Link href="/login">{es.discover.footerSignup}</Link>
        </nav>

        <nav aria-label={es.discover.footerPros}>
          <h2>{es.discover.footerPros}</h2>
          <Link href="/pro/registro">{es.discover.footerJoin}</Link>
          <Link href="/pro/terminos">{es.discover.footerProTerms}</Link>
          <Link href="/ayuda">{es.discover.footerHelp}</Link>
        </nav>

        <nav aria-label={es.discover.footerSupport}>
          <h2>{es.discover.footerSupport}</h2>
          <Link href="/ayuda">{es.discover.footerHelp}</Link>
          <Link href="/terminos">{es.discover.footerTerms}</Link>
          <Link href="/privacidad">{es.discover.footerPrivacy}</Link>
          <Link href="/cancelacion">{es.discover.footerCancel}</Link>
        </nav>
      </div>

      <div className="landing-footer-bar">
        <p className="landing-footer-copy">
          <Image src="/icon-192.png" alt="" width={20} height={20} />
          <span>© Listavy {year}</span>
        </p>
        <Link href="/ayuda" className="landing-footer-guarantee">
          <HomeIcon name="shield-check" size={18} />
          <span>{es.discover.footerGuarantee}</span>
        </Link>
      </div>
    </footer>
  );
}
