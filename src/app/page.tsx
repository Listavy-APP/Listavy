import { DEMO_PRO_ID } from "@/lib/domain/demo";
import Link from "next/link";
import { es } from "@/lib/i18n/es";
import { TRADES } from "@/lib/domain/catalog";

/** Representative category photos only. They do not show a specific pro. */
const CAT_PHOTO: Record<(typeof TRADES)[number], string> = {
  plumber: "/categories/plomero.jpg",
  electrician: "/categories/electricista.jpg",
  ac_technician: "/categories/aire-acondicionado.jpg",
  painter: "/categories/pintor.jpg",
  locksmith: "/categories/cerrajero.jpg",
  carpenter: "/categories/carpintero.jpg",
  blacksmith: "/categories/herrero.jpg",
};

export default function HomePage() {
  return (
    <section className="stack hero">
      <p className="eyebrow">{es.home.eyebrow}</p>
      <h1>{es.home.title}</h1>
      <p className="lead">{es.home.subtitle}</p>

      <form className="search-bar" role="search" action="/buscar" method="get">
        <input
          type="search"
          name="q"
          enterKeyHint="search"
          placeholder={es.home.searchPlaceholder}
          aria-label={es.home.searchPlaceholder}
        />
      </form>

      <div className="sec-title">
        <span>{es.home.servicesTitle}</span>
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
        <Link className="button secondary" href={`/pro/${DEMO_PRO_ID}`}>
          {es.proDetail.demoLink}
        </Link>
        <Link className="button" href="/login">
          {es.home.loginCta}
        </Link>
      </div>

    </section>
  );
}
