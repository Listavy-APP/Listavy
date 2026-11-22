import Link from "next/link";
import { es } from "@/lib/i18n/es";
import { BackArrow } from "@/components/BackBar";

export const metadata = { title: es.legalHub.title };

/** One place for every policy. The draft notice lives on each document page, not here. */
const DOCS: { href: string; title: string; desc: string }[] = [
  { href: "/terminos", title: es.legal.termsTitle, desc: es.legalHub.terms },
  { href: "/privacidad", title: es.legal.privacyTitle, desc: es.legalHub.privacy },
  { href: "/cookies", title: es.legal.cookiesTitle, desc: es.legalHub.cookies },
  { href: "/cancelacion", title: es.legal.cancellationTitle, desc: es.legalHub.cancellation },
  { href: "/comunidad", title: es.legal.communityTitle, desc: es.legalHub.community },
  { href: "/pro/terminos", title: es.legal.proTermsTitle, desc: es.legalHub.proTerms },
];

export default function LegalHubPage() {
  return (
    <section className="stack">
      <div className="backbar">
        <Link className="back" href="/" aria-label={es.common.back}><BackArrow /></Link>
        <span className="bt">{es.legalHub.title}</span>
      </div>
      <h1>{es.legalHub.title}</h1>
      <p className="muted">{es.legalHub.intro}</p>
      <ul className="legal-hub">
        {DOCS.map((d) => (
          <li key={d.href}>
            <Link href={d.href}>
              <strong>{d.title}</strong>
              <span className="muted">{d.desc}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="legal-credits">
        <h2>{es.legal.creditsTitle}</h2>
        <ul className="muted">
          <li>{es.legal.creditPlumber}</li>
          <li>{es.legal.creditElectrician}</li>
          <li>{es.legal.creditAc}</li>
          <li>{es.legal.creditPainter}</li>
          <li>{es.legal.creditLocksmith}</li>
          <li>{es.legal.creditCarpenter}</li>
          <li>{es.legal.creditBlacksmith}</li>
        </ul>
      </div>
    </section>
  );
}
