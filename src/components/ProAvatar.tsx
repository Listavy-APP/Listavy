import { initials } from "@/lib/domain/initials";

/**
 * Approved profile photo when the pro has one. Otherwise the initials monogram.
 * The photo URL comes from the public pro-avatars bucket. Only approved photos are listed.
 */
export function ProAvatar({ name, src }: { name: string | null; src: string | null }) {
  if (src) {
    // Public storage URL. A small avatar does not need Next's image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={src} alt="" aria-hidden="true" loading="lazy" />;
  }
  return (
    <div className="avatar" aria-hidden="true">
      {initials(name)}
    </div>
  );
}
