import Link from "next/link";
import { connection } from "next/server";
import { BackArrow } from "@/components/BackBar";
import { getProCard, getProSchedule, getProStats, getWorkPhotoUrls, isProBoosted } from "@/lib/data/pros";
import { es } from "@/lib/i18n/es";
import { avatarUrl } from "@/lib/storage/proFiles";
import { customerPhotoUrl } from "@/lib/storage/customerFiles";
import { VerificationBadges } from "@/components/VerificationBadges";
import { getCurrentProfile } from "@/lib/data/profiles";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SaveProButton } from "@/components/SaveProButton";
import { ReportProButton } from "@/components/ReportProButton";
import { listSavedProIds } from "@/lib/data/saved";
import { getProReviewSummary, listDemoReviews, listMyAuthoredReviewIds, listMyFlaggedReviewIds, listProReviews } from "@/lib/data/reviews";
import { ReviewReport } from "@/components/ReviewReport";

export const metadata = { title: es.proDetail.title };
export const instant = false;

export default async function ProDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  // Per-request render: the session is read at request time (avoids prerender of Date.now in auth).
  await connection();
  const { id } = await params;
  const { tab } = await searchParams;
  const tabReviews = tab === "resenas";
  // Public page. Only approved pros resolve. Photos need sign-in.
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const signedIn = Boolean(userData.user);

  const pro = await getProCard(supabase, id);
  // Weekly hours and today's day-off flag. Informational only: it blocks nothing (0090).
  const schedule = pro ? await getProSchedule(supabase, pro.id) : null;

  if (!pro) {
    return (
      <section className="stack">
        <div className="backbar">
          <Link className="back" href="/buscar" aria-label={es.common.back}><BackArrow /></Link>
          <span className="bt">{es.proDetail.title}</span>
        </div>
        <h1>{es.proDetail.notFound}</h1>
        <Link className="button secondary" href="/buscar">
          {es.common.back}
        </Link>
      </section>
    );
  }

  const userId = userData.user?.id ?? null;
  // The owner reached this page from the account hub: back returns there. Everyone else came from search.
  const isOwner = userId !== null && userId === pro.id;
  const backHref = isOwner ? "/cuenta" : "/buscar";
  // Owner-only fallback: the account photo is private (customer-avatars, owner or admin only).
  const ownerAccountPhoto = isOwner && !pro.avatar_path ? await customerPhotoUrl(supabase, (await getCurrentProfile(supabase))?.avatar_path ?? null) : null;
  const savedIds = userId ? await listSavedProIds(supabase, userId) : [];
  const boosted = await isProBoosted(supabase, pro.id);
  const photos = signedIn ? await getWorkPhotoUrls(supabase, pro.id) : [];
  const summary = await getProReviewSummary(supabase, pro.id);
  const stats = await getProStats(supabase, pro.id);
  // eslint-disable-next-line react-hooks/purity -- Server page: request time read once per request. Replacing it would change the page logic.
  const yearsOnPlatform = stats.joinedAt ? Math.floor((Date.now() - new Date(stats.joinedAt).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 0;
  const reviews = pro.is_demo ? [] : await listProReviews(supabase, pro.id);
  const demoReviews = pro.is_demo ? await listDemoReviews(supabase, pro.id) : [];
  // Reports are per viewer. Anonymous visitors get no report control.
  const reviewIds = reviews.map((r) => r.id);
  const myFlaggedIds = userId ? await listMyFlaggedReviewIds(supabase, reviewIds) : new Set<string>();
  const myAuthoredIds = userId ? await listMyAuthoredReviewIds(supabase, reviewIds) : new Set<string>();
  // Demo pros keep their reviews in demo_reviews, which pro_review_summary does not read.
  const headerAverage =
    pro.is_demo && demoReviews.length > 0
      ? demoReviews.reduce((sum, r) => sum + r.rating, 0) / demoReviews.length
      : summary.average;

  return (
    <section className="stack pro-profile">
      <div className="backbar">
        <Link className="back" href={backHref} aria-label={es.common.back}><BackArrow /></Link>
        <span className="bt">{es.proDetail.title}</span>
      </div>

      {pro.is_demo ? (
        <div className="panel demo-banner" role="note">
          <b>{es.proDetail.demoBanner}</b>
        </div>
      ) : null}

      <div className="account-hero pro-hero">
        <div className="account-banner" aria-hidden="true" />
        <div className="account-avatar">
          <Avatar name={pro.full_name} src={avatarUrl(supabase, pro.avatar_path) ?? ownerAccountPhoto} />
        </div>
        <h1 className="pro-name">{pro.full_name ?? es.proDetail.title}</h1>
        <div className="pro-stats" role="list">
          <div className="pro-stat" role="listitem">
            <b>{stats.completedJobs}</b>
            <span className="muted">{es.proDetail.statJobs}</span>
          </div>
          <div className="pro-stat" role="listitem">
            <b>{headerAverage == null ? "—" : `${headerAverage.toFixed(1)}★`}</b>
            <span className="muted">{es.proDetail.statRating}</span>
          </div>
          <div className="pro-stat" role="listitem">
            <b>{yearsOnPlatform < 1 ? es.proDetail.statNew : yearsOnPlatform}</b>
            <span className="muted">{es.proDetail.statSince}</span>
          </div>
        </div>
        {pro.pro_type === "company" && pro.razon_social ? <p className="sub">{pro.razon_social}</p> : null}
        <p className="sub">
          {es.trades[pro.trade]} · {pro.zone}
        </p>
        <div className="pro-badges">
          {pro.is_demo ? <span className="badge demo-badge">{es.proDetail.demoBadge}</span> : null}
          <span className="badge">
            {pro.pro_type === "company" ? es.typeRouting.companyVerified : es.search.verified}
          </span>
          {boosted ? <span className="badge">{es.search.boostedLabel}</span> : null}
        </div>
        {boosted ? <p className="muted pro-note">{es.search.boostedProfile}</p> : null}
      </div>

      <VerificationBadges supabase={supabase} proId={pro.id} isCompany={pro.pro_type === "company"} />

      {/* The owner cannot hire or report their own profile (self-hire guard, 0065). */}
      {!pro.is_demo && !isOwner ? (
      <div className="pro-actions">
        <SaveProButton userId={userId} proId={pro.id} initialSaved={savedIds.includes(pro.id)} next={`/pro/${pro.id}`} />
        {pro.available ? (
          <Link className="button" href={`/pedir?pro=${pro.id}`}>
            {es.jobs.askQuote}
          </Link>
        ) : (
          <button className="button" type="button" disabled>
            {es.availability.unavailableBtn}
          </button>
        )}
        {!pro.available ? <p className="muted">{es.availability.unavailable}</p> : null}
        <ReportProButton userId={userId} proId={pro.id} next={`/pro/${pro.id}`} />
      </div>
      ) : null}

      <div className="pro-section">
        <h2>{es.proBio.title}</h2>
        {pro.bio ? <p>{pro.bio}</p> : <p className="muted">{es.proBio.empty}</p>}
      </div>

      <div className="pro-section">
        <div className="price-block">
          <span className="muted">{es.search.priceRange}</span>
          <b>
            {es.money.dop(pro.price_min_dop)} – {es.money.dop(pro.price_max_dop)}
          </b>
        </div>
      </div>

      <div className="pro-section">
        <h2>{es.schedule.publicTitle}</h2>
        {schedule?.off_today ? <p><b>{es.schedule.offToday}</b></p> : null}
        {schedule && schedule.weekly.length > 0 ? (
          <p className="muted">
            {schedule.weekly
              .map((w) => `${es.schedule.pro.dayShort[w.weekday]} ${w.start}–${w.end}`)
              .join(" · ")}
          </p>
        ) : (
          <p className="muted">{es.schedule.publicNone}</p>
        )}
      </div>

      <div className="pro-section">
        <nav className="tabs" aria-label={es.proTabs.label}>
          <Link className="tab" href={`/pro/${pro.id}`} scroll={false} aria-current={tabReviews ? undefined : "page"}>
            {es.proTabs.work}
          </Link>
          <Link className="tab" href={`/pro/${pro.id}?tab=resenas`} scroll={false} aria-current={tabReviews ? "page" : undefined}>
            {es.proTabs.reviews}
          </Link>
        </nav>

        {tabReviews && pro.is_demo ? (
          <>
            <h2>{es.reviews.title}</h2>
            <p className="muted">{es.proDetail.demoReviewsNote}</p>
            <div className="stack">
              {demoReviews.map((r) => (
                <article key={r.id} className="panel stack demo-review">
                  <span className="badge demo-badge">{es.proDetail.demoBadge}</span>
                  <span className="muted">{es.proDetail.demoReviewLabel}</span>
                  <span>{es.reviews.average(r.rating)}</span>
                  <p>{r.comment}</p>
                </article>
              ))}
            </div>
          </>
        ) : tabReviews ? (
          <>
            <h2>{es.reviews.title}</h2>
            {summary.review_count === 0 ? (
              <EmptyState title={es.reviews.noReviews} body={es.reviews.noReviewsBody} />
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
                    {userId && !myAuthoredIds.has(r.id) ? (
                      <ReviewReport reviewId={r.id} alreadyReported={myFlaggedIds.has(r.id)} />
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <h2>{es.proDetail.photos}</h2>
            {!signedIn ? (
              <div className="panel">
                <Link href={`/login?next=${encodeURIComponent(`/pro/${pro.id}`)}`}>{es.proDetail.loginForPhotos}</Link>
              </div>
            ) : photos.length === 0 ? (
              <EmptyState title={es.proDetail.noPhotos} body={es.proDetail.noPhotosBody} />
            ) : (
              <div className="photos">
                {photos.map((src, i) => (
                  // Signed URLs change each request, so the image is not optimized by Next.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt={`${es.proDetail.photos} ${i + 1}`} loading="lazy" />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
