import Link from "next/link";
import { es } from "@/lib/i18n/es";

export default function HomePage() {
  return (
    <section className="stack hero">
      <p className="eyebrow">{es.home.eyebrow}</p>
      <h1>{es.home.title}</h1>
      <p className="lead">{es.home.subtitle}</p>
      <div className="stack" style={{ marginTop: "var(--s2)" }}>
        <Link className="button" href="/login">
          {es.home.loginCta}
        </Link>
        <Link className="button secondary" href="/buscar">
          {es.home.searchCta}
        </Link>
        <Link className="button secondary" href="/cuenta">
          {es.home.accountCta}
        </Link>
      </div>
      <p className="note">{es.home.comingSoon}</p>
    </section>
  );
}
