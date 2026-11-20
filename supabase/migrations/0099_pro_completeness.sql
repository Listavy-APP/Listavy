-- 0099: pro profile checklist and one dismissible nudge (item 8c).
-- Guidance only. Nothing here gates a pro. Verification stays the only hard gate.
-- NOT APPLIED. Sam applies via the Management API after review.

-- Dismissals live server-side so they persist per pro across devices.
create table public.pro_nudge_dismissals (
  pro_id       uuid not null references public.pros (id) on delete cascade,
  item         text not null check (item in ('verificacion', 'foto', 'pago', 'descripcion', 'horario')),
  dismissed_at timestamptz not null default now(),
  primary key (pro_id, item)
);

revoke all on public.pro_nudge_dismissals from public, anon, authenticated;
grant select on public.pro_nudge_dismissals to authenticated;
alter table public.pro_nudge_dismissals enable row level security;

create policy pro_nudge_dismissals_select_own on public.pro_nudge_dismissals
  for select to authenticated
  using (pro_id = (select auth.uid()));

-- Checklist for the signed-in pro. Empty for anyone who is not a pro or whose pro row is closed.
-- state: done | pending (in review) | missing. visibility: public | private.
-- priority: nudge order, 1 is first. Null means the row is never nudged (no fix screen, or already approved).
create or replace function public.get_my_pro_checklist()
returns table (item text, state text, visibility text, priority integer, dismissed boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  p public.pros;
  v_ver text;
  v_avatar text;
  v_pay boolean;
  v_hours boolean;
begin
  if uid is null then return; end if;
  select * into p from public.pros where id = uid and closed_at is null;
  if not found then return; end if;

  -- Verification needs both the cédula (identity) and the selfie approved.
  if (select count(distinct v.stage) from public.pro_verifications v
      where v.pro_id = uid and v.stage in ('identity', 'selfie') and v.status = 'approved') = 2 then
    v_ver := 'done';
  elsif exists (select 1 from public.pro_verifications v
                where v.pro_id = uid and v.stage in ('identity', 'selfie') and v.status = 'pending') then
    v_ver := 'pending';
  else
    v_ver := 'missing';
  end if;

  if exists (select 1 from public.pro_files f where f.pro_id = uid and f.kind = 'avatar' and f.review_status = 'approved') then
    v_avatar := 'done';
  elsif exists (select 1 from public.pro_files f where f.pro_id = uid and f.kind = 'avatar' and f.review_status = 'pending') then
    v_avatar := 'pending';
  else
    v_avatar := 'missing';
  end if;

  v_pay := exists (select 1 from public.pro_payout_details d where d.pro_id = uid);
  v_hours := exists (select 1 from public.pro_weekly_hours h where h.pro_id = uid and h.enabled);

  return query
  select x.item, x.state, x.visibility, x.priority,
         exists (select 1 from public.pro_nudge_dismissals d where d.pro_id = uid and d.item = x.item) as dismissed
  from (values
    ('verificacion', v_ver, 'public', case when p.verification_status = 'approved' then null else 1 end),
    ('foto', v_avatar, 'public', 2),
    ('pago', case when v_pay then 'done' else 'missing' end, 'private', 3),
    ('descripcion', case when length(btrim(coalesce(p.bio, ''))) > 0 then 'done' else 'missing' end, 'public', 4),
    ('horario', case when v_hours then 'done' else 'missing' end, 'public', 5),
    ('precios', case when p.price_max_dop > 0 then 'done' else 'missing' end, 'public', null),
    ('zona', case when length(btrim(p.zone)) > 0 then 'done' else 'missing' end, 'public', null)
  ) as x (item, state, visibility, priority);
end;
$$;

revoke execute on function public.get_my_pro_checklist() from public, anon;
grant execute on function public.get_my_pro_checklist() to authenticated;

-- Dismisses the nudge for one item. Only a pro may dismiss, and only the keys above.
create or replace function public.dismiss_my_pro_nudge(p_item text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Debes entrar primero.'; end if;
  if p_item not in ('verificacion', 'foto', 'pago', 'descripcion', 'horario') then
    raise exception 'Elemento no válido.';
  end if;
  if not exists (select 1 from public.pros where id = uid) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  insert into public.pro_nudge_dismissals (pro_id, item) values (uid, p_item) on conflict do nothing;
end;
$$;

revoke execute on function public.dismiss_my_pro_nudge(text) from public, anon;
grant execute on function public.dismiss_my_pro_nudge(text) to authenticated;
