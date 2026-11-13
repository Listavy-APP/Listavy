import { SkeletonBlock, SkeletonCards } from "@/components/Skeleton";

export default function Loading() {
  return (
    <section className="stack">
      <SkeletonBlock height={28} width="55%" />
      <SkeletonCards count={3} />
    </section>
  );
}
