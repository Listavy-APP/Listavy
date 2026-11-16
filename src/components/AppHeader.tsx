import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { es } from "@/lib/i18n/es";
import { HeaderProCta } from "./HeaderProCta";

/** Brand row on every page. Sub-pages keep their own back row beneath it. */
export function AppHeader() {
  return (
    <header className="app-top app-header">
      <Link href="/" aria-label={es.brand} className="brand-home">
        <Image src="/brand/listavy-lockup-horizontal.png" alt="Listavy" width={460} height={149} className="brand-lockup" priority />
      </Link>
      <nav className="header-links">
        <Suspense fallback={<Link className="link-quiet" href="/pro/registro">{es.discover.proCtaButton}</Link>}>
          <HeaderProCta />
        </Suspense>
        <Link className="link-quiet" href="/cuenta">
          {es.home.accountCta}
        </Link>
      </nav>
    </header>
  );
}
