-- 0098: in-app notification inbox (item 8b).
-- The send log gains a read marker and a deep link. Owners read their own rows (safe columns only).
-- The admin log view (admin_notification_log, 0091) is unchanged. No sends, no copy changes.

alter table public.notification_log
  add column read_at timestamptz,
  add column link text
    check (link is null or (link like '/%' and link not like '//%' and length(link) <= 300));

-- Inbox reads the newest rows per user, all statuses (an attempted channel is an entry).
create index notification_log_inbox_idx
  on public.notification_log (user_id, created_at desc);

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

-- Events, not channel rows. Preference skips (status skipped_preference) are a user's choice and never
-- appear. Delivery gaps (no_subscription, skipped_unverified, failed) do. Rows of one event share kind and the job or ticket UUID in their link,
-- and the push and email of one event land within minutes of each other. Rows join a group while
-- each is within 5 minutes of the previous one in the group. Rows with no UUID group by kind and time.
-- Security invoker: RLS limits the rows to the caller, and no user_id or detail column is read.
create or replace function public.my_notification_groups(p_limit integer default 50)
returns table (
  group_id uuid,
  kind text,
  link text,
  first_at timestamptz,
  last_at timestamptz,
  row_ids uuid[],
  channels text[],
  statuses text[],
  delivered boolean,
  unread boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with src as (
    select n.id, n.kind, n.channel, n.status, n.created_at, n.read_at, n.link,
           coalesce((regexp_match(coalesce(n.link, ''), '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'))[1], '') as subj
    from public.notification_log n
    where n.status <> 'skipped_preference'
    order by n.created_at desc
    limit 500
  ),
  flagged as (
    select s.*,
      case when lag(s.created_at) over w is null or s.created_at - lag(s.created_at) over w > interval '5 minutes'
           then 1 else 0 end as is_new
    from src s
    window w as (partition by s.kind, s.subj order by s.created_at)
  ),
  grouped as (
    select f.*, sum(f.is_new) over (partition by f.kind, f.subj order by f.created_at) as gnum
    from flagged f
  )
  select
    (array_agg(g.id order by g.created_at))[1] as group_id,
    g.kind,
    (array_agg(g.link order by g.created_at desc) filter (where g.link is not null))[1] as link,
    min(g.created_at) as first_at,
    max(g.created_at) as last_at,
    array_agg(g.id order by g.created_at) as row_ids,
    array_agg(distinct g.channel) as channels,
    array_agg(distinct g.status) as statuses,
    bool_or(g.status = 'sent') as delivered,
    bool_or(g.read_at is null) as unread
  from grouped g
  group by g.kind, g.subj, g.gnum
  order by max(g.created_at) desc
  limit least(greatest(p_limit, 1), 200);
$$;

revoke execute on function public.my_notification_groups(integer) from public, anon;
grant execute on function public.my_notification_groups(integer) to authenticated;

-- Skip rows written by the SQL senders carry a link too, so every attempt of one event groups with
-- its other channel. Mapping mirrors linkFor() in supabase/functions/_shared/notification-copy.ts.
-- If one changes, change the other.
create or replace function public.notification_link(p_kind text, p_data jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind = 'support_reply' then
      case when p_data->>'ticket_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then '/ayuda/tickets/' || (p_data->>'ticket_id') else '/ayuda/tickets' end
    when p_kind like 'recurring\_%' then '/cuenta/recurrentes'
    when p_data->>'job_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then '/trabajos/' || (p_data->>'job_id')
    else null
  end;
$$;

revoke execute on function public.notification_link(text, jsonb) from public, anon, authenticated;

-- notify_user_push: same as 0091, with the link on the skipped_preference row.
create or replace function public.notify_user_push(
  p_user uuid, p_kind text, p_title text, p_body text, p_url text, p_always boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_on boolean;
  v_link text := case when p_url like '/%' and p_url not like '//%' and length(p_url) <= 300 then p_url end;
begin
  if p_user is null then return; end if;
  begin
    select p.job_push into v_on from public.notification_preferences p where p.user_id = p_user;
    v_on := coalesce(v_on, true);
    if not p_always and not v_on then
      insert into public.notification_log (user_id, channel, kind, status, link) values (p_user, 'push', p_kind, 'skipped_preference', v_link);
      return;
    end if;

    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_secret' limit 1;
    if v_secret is null then return; end if;

    perform net.http_post(
      url := 'https://qmugoumizvtvuzndhosq.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('user_id', p_user, 'kind', p_kind, 'title', p_title, 'body', p_body, 'url', p_url)
    );
  exception when others then
    -- Never block the business write. A failed push is only a missed notification.
    return;
  end;
end;
$$;

-- notify_user_email: same as 0091, with the link on the skip rows.
create or replace function public.notify_user_email(
  p_user uuid, p_kind text, p_data jsonb, p_always boolean default false, p_job_event boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_on boolean;
  v_verified timestamptz;
  v_link text := public.notification_link(p_kind, coalesce(p_data, '{}'::jsonb));
begin
  if p_user is null then return; end if;
  begin
    if p_job_event then
      select p.job_email into v_on from public.notification_preferences p where p.user_id = p_user;
      v_on := coalesce(v_on, true);
      if not v_on then
        insert into public.notification_log (user_id, channel, kind, status, link) values (p_user, 'email', p_kind, 'skipped_preference', v_link);
        return;
      end if;
    end if;

    -- Hard rule: never send to an unverified address.
    select pr.email_verified_at into v_verified from public.profiles pr where pr.id = p_user;
    if v_verified is null then
      insert into public.notification_log (user_id, channel, kind, status, link) values (p_user, 'email', p_kind, 'skipped_unverified', v_link);
      return;
    end if;

    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_secret' limit 1;
    if v_secret is null then return; end if;

    perform net.http_post(
      url := 'https://qmugoumizvtvuzndhosq.supabase.co/functions/v1/send-email',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('user_id', p_user, 'kind', p_kind, 'data', coalesce(p_data, '{}'::jsonb))
    );
  exception when others then
    return;
  end;
end;
$$;

revoke execute on function public.notify_user_push(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.notify_user_email(uuid, text, jsonb, boolean, boolean) from public, anon, authenticated;
