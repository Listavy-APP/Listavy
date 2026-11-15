import Image from "next/image";
import Link from "next/link";
import { es } from "@/lib/i18n/es";
import { BackBar } from "@/components/BackBar";

export default function AboutPage() {
  return (
    <section className="stack about">
      <BackBar href="/" />
      <div className="about-section">
        <Image src="/brand/listavy-logo-full.png" alt="Listavy. Verified pros. A better home." width={498} height={150} className="about-logo" priority />
        <h1>{es.legal.aboutTitle}</h1>
        <p className="lead">{es.legal.aboutBody}</p>
        <p>{es.legal.operator}</p>
      </div>
      <div className="about-section">
        <h2>{es.legal.contactTitle}</h2>
        <p>{es.legal.contactEmail}</p>
      </div>
      <div className="about-section">
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
      <Link className="button secondary" href="/privacidad">
        {es.legal.privacyLink}
      </Link>
    </section>
  );
}
