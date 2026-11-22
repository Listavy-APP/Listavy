import Image from "next/image";
import { es } from "@/lib/i18n/es";
import { BackBar } from "@/components/BackBar";
import { HomeIcon } from "@/components/home/HomeIcons";

export default function AboutPage() {
  return (
    <section className="stack about">
      <BackBar href="/" />
      <div className="about-hero">
        <Image src="/brand/listavy-logo-full.png" alt="Listavy. Verified pros. A better home." width={498} height={150} className="about-logo" priority />
        <h1>{es.legal.aboutTitle}</h1>
        <p className="lead">{es.legal.aboutBody}</p>
      </div>
      <ul className="why-grid about-cards">
        <li className="why-item">
          <HomeIcon name="list-checks" size={22} />
          <div><strong>{es.legal.howTitle}</strong><span>{es.legal.howBody}</span></div>
        </li>
        <li className="why-item">
          <HomeIcon name="shield-check" size={22} />
          <div><strong>{es.legal.verifiedTitle}</strong><span>{es.legal.verifiedBody}</span></div>
        </li>
        <li className="why-item">
          <HomeIcon name="briefcase" size={22} />
          <div><strong>{es.legal.forProsTitle}</strong><span>{es.legal.forProsBody}</span></div>
        </li>
      </ul>
      <div className="about-foot">
        <h2>{es.legal.contactTitle}</h2>
        <p className="about-pill">{es.legal.contactEmail}</p>
        <p className="about-pill">{es.legal.supportEmail}</p>
      </div>
    </section>
  );
}
