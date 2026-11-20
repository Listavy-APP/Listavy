-- 0098: in-app notification inbox (item 8b).
-- The send log gains a read marker and a deep link. Owners read their own rows (safe columns only).
-- The admin log view (admin_notification_log, 0091) is unchanged. No sends, no copy changes.

alter table public.notification_log
  add column read_at timestamptz,
  add column link text
    check (link is null or (link like '/%' and link not like '//%' and length(link) <= 300));

-- Unread count and inbox list both filter on sent rows for one user.
create index notification_log_inbox_idx
  on public.notification_log (user_id, created_at desc)
  where status = 'sent';

-- Start from no table privileges for anyone (PUBLIC included), then grant only what the owner needs.
revoke all on public.notification_log from public, anon, authenticated;

-- Owner-only read. user_id and detail stay unreadable to users (detail can carry provider errors).
grant select (id, kind, channel, status, created_at, read_at, link) on public.notification_log to authenticated;
create policy notification_log_owner_select on public.notification_log
  for select to authenticated
  using (user_id = auth.uid());

-- Owner may change only read_at, and only on their own rows.
grant update (read_at) on public.notification_log to authenticated;
create policy notification_log_owner_mark_read on public.notification_log
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
