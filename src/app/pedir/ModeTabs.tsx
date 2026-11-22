import Link from "next/link";
import { es } from "@/lib/i18n/es";

/** Quote or fixed-price mode switch for /pedir. The active tab carries aria-current. */
export function ModeTabs({ active }: { active: "quote" | "fixed" }) {
  return (
    <nav className="row" aria-label={es.fixed.modeQuote}>
      <Link className={active === "quote" ? "button" : "button secondary"} href="/pedir" aria-current={active === "quote" ? "page" : undefined}>
        {es.fixed.modeQuote}
      </Link>
      <Link className={active === "fixed" ? "button" : "button secondary"} href="/pedir?modo=fijo" aria-current={active === "fixed" ? "page" : undefined}>
        {es.fixed.modePrice}
      </Link>
    </nav>
  );
}
