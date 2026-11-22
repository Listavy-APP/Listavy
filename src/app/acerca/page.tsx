import Image from "next/image";
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
      </div>
      <div className="about-section">
        <h2>{es.legal.howTitle}</h2>
        <p>{es.legal.howBody}</p>
      </div>
      <div className="about-section">
        <h2>{es.legal.verifiedTitle}</h2>
        <p>{es.legal.verifiedBody}</p>
      </div>
      <div className="about-section">
        <h2>{es.legal.forProsTitle}</h2>
        <p>{es.legal.forProsBody}</p>
      </div>
      <div className="about-section">
        <p>{es.legal.operator}</p>
      </div>
      <div className="about-section">
        <h2>{es.legal.contactTitle}</h2>
        <p>{es.legal.contactEmail}</p>
        <p>{es.legal.supportEmail}</p>
      </div>
    </section>
  );
}
