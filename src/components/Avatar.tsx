import { initials } from "@/lib/domain/initials";

/**
 * Profile photo when one is set, otherwise the initials monogram.
 * Used for pros (public bucket, pre-reviewed) and customers (private bucket, signed URL).
 * The caller decides the URL. This component never fetches anything.
 */
export function Avatar({ name, src }: { name: string | null; src: string | null }) {
  if (src) {
    // A small avatar does not need Next's image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={src} alt="" aria-hidden="true" loading="lazy" />;
  }
  return (
    <div className="avatar" aria-hidden="true">
      {initials(name)}
    </div>
  );
}
