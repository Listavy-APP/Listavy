import Link from "next/link";
import { es } from "@/lib/i18n/es";

/** Brand row on every page. Sub-pages keep their own back row beneath it. */
export function AppHeader() {
  return (
    <header className="app-top app-header">
      <Link className="wordmark" href="/" aria-label={es.brand}>
        lista<span>vy</span>
      </Link>
      <Link className="link-quiet" href="/cuenta">
        {es.home.accountCta}
      </Link>
    </header>
  );
}
