import Link from "next/link";
import { es } from "@/lib/i18n/es";
import type { ProCard } from "@/lib/types/database";
import type { VerifiedKind } from "@/lib/domain/verifiedIcon";
import { VerifiedIcon } from "@/components/VerifiedIcon";

/** Compact verified-pro card for the home rails. No rating: reviews are not shown until they exist. */
export function ProMiniCard({ pro, tradeLabel, avatarSrc, verified }: { pro: ProCard; tradeLabel: string; avatarSrc: string | null; verified: VerifiedKind | null }) {
  return (
    <Link className="mini-card" href={`/pro/${pro.id}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {avatarSrc ? <img className="mini-photo" src={avatarSrc} alt="" loading="lazy" /> : <span className="mini-photo mini-photo-empty" aria-hidden="true" />}
      <span className="mini-body">
        <span className="mini-name">
          {pro.full_name ?? ""}
          {verified ? <> <VerifiedIcon kind={verified} /></> : null}
        </span>
        <span className="muted">{tradeLabel} · {pro.zone}</span>
        <span className="muted">{es.search.priceRange}: {es.money.dop(pro.price_min_dop)} – {es.money.dop(pro.price_max_dop)}</span>
      </span>
    </Link>
  );
}
