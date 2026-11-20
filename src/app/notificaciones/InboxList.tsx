"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { markAllInboxRead, markInboxEntryRead, type InboxEntry } from "@/lib/data/notifications";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const TZ = "America/Santo_Domingo";

function when(iso: string): string {
  return new Date(iso).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: TZ });
}

function kindLabel(kind: string): string {
  return es.inbox.kinds[kind] ?? es.inbox.fallbackKind;
}

function channelsLabel(e: InboxEntry): string {
  const names = e.channels.map((c) => es.inbox.channel[c]).join(" + ");
  return e.delivered ? names : `${names} · ${es.inbox.notDelivered}`;
}

/** Opening an entry marks it read first, then follows its link. */
export function InboxList({ entries: initial }: { entries: InboxEntry[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState(initial);
  const [busy, setBusy] = useState(false);
  const unread = entries.filter((e) => e.unread).length;

  async function open(e: InboxEntry) {
    if (e.unread) {
      setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, unread: false } : x)));
      try {
        await markInboxEntryRead(createSupabaseBrowserClient(), e.row_ids);
      } catch {
        // The entry stays unread on the server. Navigation still works.
      }
    }
    if (e.link) router.push(e.link);
    else router.refresh();
  }

  async function markAll() {
    setBusy(true);
    try {
      await markAllInboxRead(createSupabaseBrowserClient());
      setEntries((prev) => prev.map((x) => ({ ...x, unread: false })));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {unread > 0 ? (
        <button className="button secondary" type="button" disabled={busy} onClick={markAll}>
          {es.inbox.markAll}
        </button>
      ) : null}
      <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
        {entries.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className="panel stack"
              style={{ width: "100%", textAlign: "left" }}
              onClick={() => open(e)}
              aria-label={`${kindLabel(e.kind)}, ${when(e.last_at)}${e.unread ? `, ${es.inbox.unread}` : ""}`}
            >
              <span className="muted">
                {when(e.last_at)} · {channelsLabel(e)}
                {e.unread ? ` · ${es.inbox.unread}` : ""}
              </span>
              <strong>{kindLabel(e.kind)}</strong>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
