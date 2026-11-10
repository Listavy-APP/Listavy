import Link from "next/link";
import { getProCard, getWorkPhotoUrls } from "@/lib/data/pros";
import { es } from "@/lib/i18n/es";
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
      <h1>{pro.full_name ?? es.proDetail.title}</h1>
      <div className="badge">{es.search.verified}</div>
      <p className="muted">{es.proDetail.noReviews}</p>
      <dl className="details">
        <dt>{es.proDetail.trade}</dt>
        <dd>{es.trades[pro.trade]}</dd>
        <dt>{es.proDetail.zone}</dt>
        <dd>{pro.zone}</dd>
        <dt>{es.search.priceRange}</dt>
        <dd>
          {es.money.dop(pro.price_min_dop)} – {es.money.dop(pro.price_max_dop)}
        </dd>
      </dl>

      <h2>{es.proDetail.photos}</h2>
      {!signedIn ? (
        <p className="muted">
          <Link href="/login">{es.proDetail.loginForPhotos}</Link>
        </p>
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

      <Link className="button secondary" href="/buscar">
        {es.common.back}
      </Link>
    </section>
  );
}
