/**
 * JSON-LD for public pages. Public facts only: names, trade, zone, links, photo.
 * Deliberately no aggregateRating or review: public reviews are not shipped yet.
 */

const CONTEXT = "https://schema.org";

export function proJsonLd(input: { url: string; name: string; tradeLabel: string; zone: string; image: string | null }) {
  return {
    "@context": CONTEXT,
    "@type": "ProfessionalService",
    name: input.name,
    description: `${input.tradeLabel} en ${input.zone}, Santo Domingo.`,
    url: input.url,
    ...(input.image ? { image: input.image } : {}),
    areaServed: { "@type": "Place", name: input.zone },
  };
}

export function tradeJsonLd(input: {
  url: string;
  name: string;
  items: { name: string; url: string }[];
}) {
  return {
    "@context": CONTEXT,
    "@type": "CollectionPage",
    name: input.name,
    url: input.url,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.items.length,
      itemListElement: input.items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        url: item.url,
      })),
    },
  };
}
