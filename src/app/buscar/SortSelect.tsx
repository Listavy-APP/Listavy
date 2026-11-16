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
      <span className="select-wrap">
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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </span>
    </label>
  );
}
