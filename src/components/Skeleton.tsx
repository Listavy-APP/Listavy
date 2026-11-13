/** Loading placeholder. Pulses only when motion is allowed (see globals.css). */
export function SkeletonBlock({ height = 16, width = "100%" }: { height?: number; width?: string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="stack" role="status" aria-label="Cargando">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="panel stack">
          <SkeletonBlock height={18} width="60%" />
          <SkeletonBlock height={14} width="40%" />
          <SkeletonBlock height={44} />
        </div>
      ))}
    </div>
  );
}
