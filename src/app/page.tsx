import Link from "next/link";
import { es } from "@/lib/i18n/es";

export default function HomePage() {
  return (
    <section className="stack">
      <h1>{es.home.title}</h1>
      <p className="lead">{es.home.subtitle}</p>
      <Link className="button" href="/login">
        {es.home.loginCta}
      </Link>
      <Link className="button secondary" href="/cuenta">
        {es.home.accountCta}
      </Link>
      <p className="muted">{es.home.comingSoon}</p>
    </section>
  );
}
