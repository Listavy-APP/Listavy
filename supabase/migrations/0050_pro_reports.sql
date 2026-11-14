-- Pro reports ("Reportar"). Additive. Owner-only RLS; admin reads through list_pro_reports() only.
create table public.pro_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  pro_id uuid not null references public.pros (id) on delete cascade,
  reason text not null check (reason in ('no_show','bad_quality','unsafe','fraud','inappropriate','other')),
  details text check (details is null or char_length(details) <= 500),
  created_at timestamptz not null default now(),
  constraint pro_reports_one_per_pair unique (reporter_id, pro_id)
);

create index pro_reports_pro_id_idx on public.pro_reports (pro_id);

alter table public.pro_reports enable row level security;

create policy pro_reports_owner_select on public.pro_reports
  for select to authenticated using (reporter_id = auth.uid());
create policy pro_reports_owner_insert on public.pro_reports
  for insert to authenticated with check (reporter_id = auth.uid() and pro_id <> auth.uid());

revoke all on public.pro_reports from anon;

-- Admin list. Checks the caller's role; the table itself has no admin policy.
create or replace function public.list_pro_reports()
returns table (
  id uuid,
  pro_id uuid,
  pro_name text,
  reason text,
  details text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Solo administradores.' using errcode = '42501';
  end if;

  return query
    select r.id, r.pro_id, pr.full_name, r.reason, r.details, r.created_at
    from public.pro_reports r
    left join public.profiles pr on pr.id = r.pro_id
    order by r.created_at desc
    limit 200;
end;
$$;

revoke all on function public.list_pro_reports() from public, anon;
grant execute on function public.list_pro_reports() to authenticated;
