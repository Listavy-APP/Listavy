import Link from "next/link";
import { es } from "@/lib/i18n/es";
import { TRADES } from "@/lib/domain/catalog";

const CAT_PHOTO: Record<(typeof TRADES)[number], string> = {
  plumber: "/categories/plomero.jpg",
  electrician: "/categories/electricista.jpg",
  ac_technician: "/categories/aire-acondicionado.jpg",
};

export default function HomePage() {
  return (
    <section className="stack hero">
      <div className="app-top">
        <span className="wordmark">
          lista<span>vy</span>
        </span>
        <Link className="link-quiet" href="/cuenta">
          {es.home.accountCta}
        </Link>
      </div>

      <p className="eyebrow">{es.home.eyebrow}</p>
      <h1>{es.home.title}</h1>
      <p className="lead">{es.home.subtitle}</p>

      <Link className="search-bar" href="/buscar">
        {es.home.searchPlaceholder}
      </Link>

      <div className="sec-title">
        <span>{es.home.servicesTitle}</span>
        <Link href="/buscar">{es.home.seeAll}</Link>
      </div>
      <div className="cats">
        {TRADES.map((t) => (
          <Link key={t} className="cat" href={`/buscar?trade=${t}`}>
            {/* Representative category photo, not a specific pro. Label text carries the meaning. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="cat-photo" src={CAT_PHOTO[t]} alt="" loading="lazy" />
            <span className="cat-name">{es.trades[t]}</span>
          </Link>
        ))}
      </div>

      <div className="actions">
        <Link className="button" href="/login">
          {es.home.loginCta}
        </Link>
      </div>

    </section>
  );
}
