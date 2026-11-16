"use client";

import { useRouter } from "next/navigation";
import { es } from "@/lib/i18n/es";
import type { SortKey } from "@/lib/domain/discovery";

/** Sort dropdown. Changing it keeps every other filter in the URL. */
export function SortSelect({ current, params }: { current: SortKey; params: Record<string, string> }) {
  const router = useRouter();
  return (
    <label className="sort-select">
      <span className="muted">{es.filters.sortLabel}</span>
      <select
        value={current}
        onChange={(e) => {
          const sp = new URLSearchParams(params);
          if (e.target.value === "recomendados") sp.delete("sort");
          else sp.set("sort", e.target.value);
          const qs = sp.toString();
          router.push(qs ? `/buscar?${qs}` : "/buscar");
        }}
      >
        <option value="recomendados">{es.filters.sortRecommended}</option>
        <option value="distancia">{es.filters.sortDistance}</option>
        <option value="rated" disabled>{`${es.filters.sortRated} (${es.filters.sortRatedSoon})`}</option>
        <option value="precio">{es.filters.sortPrice}</option>
      </select>
    </label>
  );
}
