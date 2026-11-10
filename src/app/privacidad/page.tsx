import Link from "next/link";
import { es } from "@/lib/i18n/es";

export default function PrivacyPage() {
  return (
    <section className="stack">
      <h1>{es.legal.privacyTitle}</h1>
      <p>{es.legal.operator}</p>
      <p>{es.legal.privacyBody}</p>
      <Link className="button secondary" href="/acerca">
        {es.legal.aboutLink}
      </Link>
    </section>
  );
}
