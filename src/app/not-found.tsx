import Link from "next/link";
import { es } from "@/lib/i18n/es";

export default function NotFound() {
  return (
    <section className="stack">
      <h1>{es.notFound.title}</h1>
      <p className="lead">{es.notFound.body}</p>
      <Link className="button" href="/">
        {es.notFound.home}
      </Link>
    </section>
  );
}
