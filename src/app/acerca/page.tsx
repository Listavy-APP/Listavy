import Link from "next/link";
import { es } from "@/lib/i18n/es";

export default function AboutPage() {
  return (
    <section className="stack">
      <h1>{es.legal.aboutTitle}</h1>
      <p className="lead">{es.legal.aboutBody}</p>
      <p>{es.legal.operator}</p>
      <h2>{es.legal.contactTitle}</h2>
      <p>{es.legal.contactEmail}</p>
      <p>{es.legal.contactAddress}</p>
      <h2>{es.legal.creditsTitle}</h2>
      <ul className="muted">
        <li>{es.legal.creditPlumber}</li>
        <li>{es.legal.creditElectrician}</li>
        <li>{es.legal.creditAc}</li>
      </ul>
      <Link className="button secondary" href="/privacidad">
        {es.legal.privacyLink}
      </Link>
    </section>
  );
}
