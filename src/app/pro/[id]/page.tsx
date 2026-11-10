import Link from "next/link";
import { getProCard, getWorkPhotoUrls } from "@/lib/data/pros";
import { es } from "@/lib/i18n/es";
import { initials } from "@/lib/domain/initials";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.proDetail.title };
export const instant = false;

export default async function ProDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Public page. Only approved pros resolve. Photos need sign-in.
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const signedIn = Boolean(userData.user);

  const pro = await getProCard(supabase, id);

  if (!pro) {
    return (
      <section className="stack">
        <div className="backbar">
          <Link className="back" href="/buscar" aria-label={es.common.back}>
            ‹
          </Link>
          <span className="bt">{es.proDetail.title}</span>
        </div>
        <h1>{es.proDetail.notFound}</h1>
        <Link className="button secondary" href="/buscar">
          {es.common.back}
        </Link>
      </section>
    );
  }

  const photos = signedIn ? await getWorkPhotoUrls(supabase, pro.id) : [];

  return (
    <section className="stack">
      <div className="backbar">
        <Link className="back" href="/buscar" aria-label={es.common.back}>
          ‹
        </Link>
        <span className="bt">{es.proDetail.title}</span>
      </div>

      <div className="pro-hero">
        <div className="avatar" aria-hidden="true">
          {initials(pro.full_name)}
        </div>
        <h1>{pro.full_name ?? es.proDetail.title}</h1>
        <div className="badge">{es.search.verified}</div>
        <p className="sub">
          {es.trades[pro.trade]} · {pro.zone}
        </p>
      </div>

      <div className="price-block">
        <span className="muted">{es.search.priceRange}</span>
        <b>
          {es.money.dop(pro.price_min_dop)} – {es.money.dop(pro.price_max_dop)}
        </b>
      </div>

      <p className="muted">{es.proDetail.noReviews}</p>

      <h2>{es.proDetail.photos}</h2>
      {!signedIn ? (
        <div className="panel">
          <Link href="/login">{es.proDetail.loginForPhotos}</Link>
        </div>
      ) : photos.length === 0 ? (
        <p className="muted">{es.proDetail.noPhotos}</p>
      ) : (
        <div className="photos">
          {photos.map((src, i) => (
            // Signed URLs change each request, so the image is not optimized by Next.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={`${es.proDetail.photos} ${i + 1}`} loading="lazy" />
          ))}
        </div>
      )}
    </section>
  );
}
