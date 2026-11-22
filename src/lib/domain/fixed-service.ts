/**
 * Fixed-price services (0116). Pure logic only: no I/O.
 * The catalog is set by an admin. Prices are never invented here.
 */

export type FixedServiceRow = {
  id: string;
  trade: string;
  slug: string;
  name_es: string;
  includes_es: string;
  price_dop: number;
  active: boolean;
  sort_order: number;
};

/** What the public sees of a service: no sort order, no status. */
export type PublicFixedService = Pick<FixedServiceRow, "id" | "trade" | "slug" | "name_es" | "includes_es" | "price_dop">;

/** Lowercase ASCII slug from a Spanish name: accents stripped, runs of other characters become "-". */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** True when the slug matches the database check (2 to 80 characters of a-z, 0-9 and "-"). */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]{2,80}$/.test(slug);
}

/** Groups services by trade, keeping the input order inside each group. Trade order follows first appearance. */
export function groupByTrade<T extends { trade: string }>(rows: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const list = out.get(r.trade);
    if (list) list.push(r);
    else out.set(r.trade, [r]);
  }
  return out;
}

/** A booking needs a service the pro has opted into. Inactive or unlisted services never book. */
export function isBookable(service: FixedServiceRow, optedInIds: ReadonlySet<string>): boolean {
  return service.active && optedInIds.has(service.id);
}
