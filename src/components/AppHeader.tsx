import Image from "next/image";
import Link from "next/link";
import { es } from "@/lib/i18n/es";

/** Brand row on every page. Sub-pages keep their own back row beneath it. */
export function AppHeader() {
  return (
    <header className="app-top app-header">
      <Link href="/" aria-label={es.brand} className="brand-home">
        <Image src="/brand/listavy-lockup-horizontal.png" alt="Listavy" width={460} height={149} className="brand-lockup" priority />
      </Link>
      <Link className="link-quiet" href="/cuenta">
        {es.home.accountCta}
      </Link>
    </header>
  );
}
