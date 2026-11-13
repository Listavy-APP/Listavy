"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { es } from "@/lib/i18n/es";
import {
  editReview,
  flagReview,
  respondToReview,
  reviewHasContactDetails,
  submitClientRating,
  submitReview,
  type ReviewRow,
} from "@/lib/data/reviews";

const DAY_MS = 24 * 60 * 60 * 1000;

interface Props {
  jobId: string;
  role: "homeowner" | "pro";
  jobStatus: string;
  paid: boolean;
  disputeOpen: boolean;
  review: ReviewRow | null;
  hasClientRating: boolean;
}

export function ReviewPanel({ jobId, role, jobStatus, paid, disputeOpen, review, hasClientRating }: Props) {
  if (jobStatus !== "completed") return null;

  if (role === "homeowner") {
    if (!paid && !review) return null;
    if (!review) {
      if (disputeOpen) return <p className="review-hold" role="status">{es.reviews.inDispute}</p>;
      return <ReviewForm jobId={jobId} />;
    }
    return <OwnReview review={review} disputeOpen={disputeOpen} />;
  }

  return (
    <>
      {review ? <ProResponse review={review} disputeOpen={disputeOpen} /> : null}
      {!hasClientRating ? <ClientRatingForm jobId={jobId} /> : null}
    </>
  );
}

function StarRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="stars-row" role="radiogroup" aria-label={label}>
      <span>{label}</span>
      <span className="stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={n <= value ? "star on" : "star"}
            aria-label={`${n} de 5`}
            aria-checked={n === value}
            role="radio"
            onClick={() => onChange(n)}
          >
            ★
          </button>
        ))}
      </span>
    </div>
  );
}

function ReviewForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [quality, setQuality] = useState(0);
  const [punctuality, setPunctuality] = useState(0);
  const [cleanliness, setCleanliness] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = comment.trim();
  const needsComment = rating > 0 && rating < 4;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rating || !quality || !punctuality || !cleanliness) {
      setError(es.reviews.fail);
      return;
    }
    if (needsComment && trimmed.length < 20) {
      setError(es.reviews.commentRequired);
      return;
    }
    if (reviewHasContactDetails(trimmed)) {
      setError(es.reviews.contactBlocked);
      return;
    }
    setBusy(true);
    try {
      await submitReview(createSupabaseBrowserClient(), jobId, {
        rating,
        quality,
        punctuality,
        cleanliness,
        comment: trimmed || null,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.reviews.fail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={onSubmit}>
      <h2>{es.reviews.promptHeading}</h2>
      <StarRow label={es.reviews.overall} value={rating} onChange={setRating} />
      <StarRow label={es.reviews.quality} value={quality} onChange={setQuality} />
      <StarRow label={es.reviews.punctuality} value={punctuality} onChange={setPunctuality} />
      <StarRow label={es.reviews.cleanliness} value={cleanliness} onChange={setCleanliness} />
      <label>
        {es.reviews.comment}
        <textarea
          value={comment}
          maxLength={500}
          onChange={(e) => setComment(e.target.value)}
          placeholder={needsComment ? es.reviews.commentRequired : ""}
        />
        <span className="muted">{es.reviews.commentLimit(comment.length)}</span>
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button className="button" type="submit" disabled={busy}>
        {es.reviews.submit}
      </button>
    </form>
  );
}

function OwnReview({ review, disputeOpen }: { review: ReviewRow; disputeOpen: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(review.rating);
  const [quality, setQuality] = useState(review.quality ?? 0);
  const [punctuality, setPunctuality] = useState(review.punctuality ?? 0);
  const [cleanliness, setCleanliness] = useState(review.cleanliness ?? 0);
  const [comment, setComment] = useState(review.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);

  const withinEdit = Date.now() - new Date(review.created_at).getTime() < DAY_MS;
  const canEdit = withinEdit && !disputeOpen && review.status === "published";

  if (review.status === "removed") {
    return <p className="muted">{es.reviews.removedNote}</p>;
  }
  if (review.status === "hidden" || disputeOpen) {
    return <p className="muted">{es.reviews.inDispute}</p>;
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = comment.trim();
    if (rating < 4 && trimmed.length < 20) {
      setError(es.reviews.commentRequired);
      return;
    }
    if (reviewHasContactDetails(trimmed)) {
      setError(es.reviews.contactBlocked);
      return;
    }
    try {
      await editReview(createSupabaseBrowserClient(), review.id, {
        rating,
        quality,
        punctuality,
        cleanliness,
        comment: trimmed || null,
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.reviews.fail);
    }
  }

  async function onFlag() {
    try {
      await flagReview(createSupabaseBrowserClient(), review.id, "other");
      setFlagged(true);
    } catch {
      setError(es.reviews.fail);
    }
  }

  if (editing) {
    return (
      <form className="panel stack" onSubmit={onSave}>
        <StarRow label={es.reviews.overall} value={rating} onChange={setRating} />
        <StarRow label={es.reviews.quality} value={quality} onChange={setQuality} />
        <StarRow label={es.reviews.punctuality} value={punctuality} onChange={setPunctuality} />
        <StarRow label={es.reviews.cleanliness} value={cleanliness} onChange={setCleanliness} />
        <textarea value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} />
        <p className="muted">{es.reviews.editWindow}</p>
        {error ? <p className="error">{error}</p> : null}
        <button className="button" type="submit">{es.reviews.save}</button>
      </form>
    );
  }

  return (
    <div className="panel stack">
      <b>{es.reviews.average(review.rating)}</b>
      {review.comment ? <p>{review.comment}</p> : null}
      {canEdit ? (
        <button className="button secondary" type="button" onClick={() => setEditing(true)}>
          {es.reviews.edit}
        </button>
      ) : (
        <p className="muted">{es.reviews.editClosed}</p>
      )}
      {flagged ? <p className="muted">{es.reviews.flagged}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

function ProResponse({ review, disputeOpen }: { review: ReviewRow; disputeOpen: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (disputeOpen || review.status !== "published") return null;

  if (review.response) {
    return (
      <div className="panel stack">
        <b>{es.reviews.respondTitle}</b>
        <p>{review.response.body}</p>
        {review.response.edited ? <span className="muted">{es.reviews.responseEdited}</span> : null}
      </div>
    );
  }

  async function onRespond(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > 500) {
      setError(es.reviews.respondPlaceholder);
      return;
    }
    if (reviewHasContactDetails(trimmed)) {
      setError(es.reviews.contactBlocked);
      return;
    }
    try {
      await respondToReview(createSupabaseBrowserClient(), review.id, trimmed);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.reviews.fail);
    }
  }

  return (
    <form className="panel stack" onSubmit={onRespond}>
      <b>{es.reviews.respondTitle}</b>
      <textarea
        value={body}
        maxLength={500}
        onChange={(e) => setBody(e.target.value)}
        placeholder={es.reviews.respondPlaceholder}
      />
      {error ? <p className="error">{error}</p> : null}
      <button className="button" type="submit">{es.reviews.respond}</button>
    </form>
  );
}

function ClientRatingForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [punctuality, setPunctuality] = useState(0);
  const [clarity, setClarity] = useState(0);
  const [payment, setPayment] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!punctuality || !clarity || !payment) {
      setError(es.reviews.fail);
      return;
    }
    try {
      await submitClientRating(createSupabaseBrowserClient(), jobId, { punctuality, clarity, payment });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.reviews.fail);
    }
  }

  return (
    <form className="panel stack" onSubmit={onSubmit}>
      <h2>{es.reviews.privateTitle}</h2>
      <p className="muted">{es.reviews.privateNote}</p>
      <StarRow label={es.reviews.punctualityClient} value={punctuality} onChange={setPunctuality} />
      <StarRow label={es.reviews.clarity} value={clarity} onChange={setClarity} />
      <StarRow label={es.reviews.payment} value={payment} onChange={setPayment} />
      {error ? <p className="error">{error}</p> : null}
      <button className="button" type="submit">{es.reviews.privateSubmit}</button>
    </form>
  );
}
