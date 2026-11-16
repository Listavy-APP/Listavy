import Link from "next/link";
import { es } from "@/lib/i18n/es";
import type { ProCard } from "@/lib/types/database";

/** Compact verified-pro card for the home rails. No rating: reviews are not shown until they exist. */
export function ProMiniCard({ pro, avatarSrc }: { pro: ProCard; avatarSrc: string | null }) {
  return (
    <Link className="mini-card" href={`/pro/${pro.id}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {avatarSrc ? <img className="mini-photo" src={avatarSrc} alt="" loading="lazy" /> : <span className="mini-photo mini-photo-empty" aria-hidden="true" />}
      <span className="mini-body">
        <span className="mini-name">{pro.full_name ?? ""}</span>
        <span className="muted">{es.trades[pro.trade]} · {pro.zone}</span>
        <span className="muted">{es.search.priceRange}: {es.money.dop(pro.price_min_dop)} – {es.money.dop(pro.price_max_dop)}</span>
        {pro.identity_verified ? <span className="verified-badge">{es.search.verified}</span> : null}
      </span>
    </Link>
  );
}
