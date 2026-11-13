import type { ReactNode } from "react";

export type RecordItem = {
  key: string;
  title: ReactNode;
  rows: [label: string, value: ReactNode][];
};

/** Stacked record cards for admin data on phone widths (replaces wide tables). */
export function RecordList({ items }: { items: RecordItem[] }) {
  return (
    <ul className="records">
      {items.map((item) => (
        <li key={item.key} className="record">
          <p className="record-title">{item.title}</p>
          <dl className="record-rows">
            {item.rows.map(([label, value], i) => (
              <div key={`${item.key}-${i}`} className="record-row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}
