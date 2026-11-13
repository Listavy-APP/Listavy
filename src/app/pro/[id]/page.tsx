import Link from "next/link";
import { getProCard, getWorkPhotoUrls } from "@/lib/data/pros";
import { es } from "@/lib/i18n/es";
import { avatarUrl } from "@/lib/storage/proFiles";
import { Avatar } from "@/components/Avatar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProReviewSummary, listProReviews } from "@/lib/data/reviews";

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
  const summary = await getProReviewSummary(supabase, pro.id);
  const reviews = await listProReviews(supabase, pro.id);

  return (
    <section className="stack">
      <div className="backbar">
        <Link className="back" href="/buscar" aria-label={es.common.back}>
          ‹
        </Link>
        <span className="bt">{es.proDetail.title}</span>
      </div>

      <div className="pro-hero">
        <Avatar name={pro.full_name} src={avatarUrl(supabase, pro.avatar_path)} />
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

      <h2>{es.reviews.title}</h2>
      {summary.review_count === 0 ? (
        <p className="muted">{es.reviews.noReviews}</p>
      ) : (
        <div className="stack">
          <b>
            {es.reviews.average(summary.average ?? 0)} · {summary.review_count === 1 ? es.reviews.countOne : es.reviews.countMany(summary.review_count)}
          </b>
          {summary.review_count < 3 ? <span className="muted">{es.reviews.fewReviews(summary.review_count)}</span> : null}
          {reviews.map((r) => (
            <article key={r.id} className="panel stack">
              <b>{r.reviewer_name}</b>
              <span>{es.reviews.average(r.rating)}</span>
              {r.comment ? <p>{r.comment}</p> : null}
              {r.response ? (
                <p className="muted">
                  <b>{es.reviews.respondTitle}:</b> {r.response.body}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <Link className="button" href={`/pedir?pro=${pro.id}`}>
        {es.jobs.askQuote}
      </Link>

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
