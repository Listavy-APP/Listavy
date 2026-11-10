/** Visual only: two-letter monogram from the first two words of a name. */
export function initials(name: string | null): string {
  if (!name) return "?";
  const words = name.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  return (
    words
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "?"
  );
}
