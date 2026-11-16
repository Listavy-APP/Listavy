/** Branded skeleton cards while /buscar results load. */
export default function SearchLoading() {
  return (
    <section className="stack" aria-busy="true" aria-live="polite">
      <div className="skeleton-bar" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <span className="skeleton-photo" />
          <span className="skeleton-lines">
            <span className="skeleton-line w70" />
            <span className="skeleton-line w50" />
            <span className="skeleton-line w40" />
          </span>
        </div>
      ))}
    </section>
  );
}
