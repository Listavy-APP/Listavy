"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { es } from "@/lib/i18n/es";

export type PickerPro = {
  id: string;
  name: string | null;
  trade: string;
  tradeLabel: string;
  zone: string;
  priceLabel: string;
  reviewLabel: string;
  avatarSrc: string | null;
};

const MAX = 3;

/**
 * Multi-pro picker for /buscar. Up to 3 pros, all the same trade (jobs require one trade).
 * Selection is passed to /pedir as ?pro=<id>,<id>,... which the request page already accepts.
 */
export function ProPicker({ pros }: { pros: PickerPro[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const pickedTrade = picked.length > 0 ? pros.find((p) => p.id === picked[0])?.trade ?? null : null;

  function toggle(p: PickerPro) {
    setNotice(null);
    if (picked.includes(p.id)) {
      setPicked(picked.filter((id) => id !== p.id));
      return;
    }
    if (picked.length >= MAX) return setNotice(es.picker.max);
    if (pickedTrade && p.trade !== pickedTrade) return setNotice(es.picker.sameTrade);
    setPicked([...picked, p.id]);
  }

  const href = `/pedir?pro=${picked.join(",")}`;

  return (
    <>
      <ul className="cards">
        {pros.map((p) => {
          const on = picked.includes(p.id);
          const blocked = !on && ((picked.length >= MAX) || (pickedTrade !== null && p.trade !== pickedTrade));
          return (
            <li key={p.id} className={`card${on ? " card-picked" : ""}`}>
              <div className="card-head">
                <Avatar name={p.name} src={p.avatarSrc} />
                <div className="card-body">
                  <p className="card-name">{p.name ?? "—"}</p>
                  <p className="muted">
                    {p.tradeLabel} · {p.zone}
                  </p>
                </div>
              </div>
              <div className="badge">{es.search.verified}</div>
              <p className="card-price">{p.priceLabel}</p>
              <p className="muted">{p.reviewLabel}</p>
              <div className="card-actions">
                <button
                  type="button"
                  className={`button ${on ? "" : "secondary"}`}
                  aria-pressed={on}
                  aria-label={`${on ? es.picker.picked : es.picker.pick}: ${p.name ?? ""}`}
                  disabled={blocked}
                  onClick={() => toggle(p)}
                >
                  {on ? es.picker.picked : es.picker.pick}
                </button>
                <Link className="button secondary" href={`/pro/${p.id}`}>
                  {es.search.viewProfile}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      {notice ? <p className="error" role="status">{notice}</p> : null}

      {picked.length > 0 ? (
        <div className="pick-bar" role="region" aria-label={es.picker.chooseHint}>
          <span className="muted">{picked.length} / {MAX}</span>
          <Link className="button" href={href}>
            {picked.length === 1 ? es.picker.askOne : es.picker.askMany(picked.length)}
          </Link>
        </div>
      ) : null}
    </>
  );
}
