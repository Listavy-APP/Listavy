-- Resolve mark for pro reports. Additive. Owner-only table; admin writes go through SECURITY DEFINER functions.
alter table public.pro_reports add column if not exists resolved_at timestamptz;

create index if not exists pro_reports_open_idx
  on public.pro_reports (created_at) where resolved_at is null;

drop function if exists public.list_pro_reports();

create or replace function public.list_pro_reports()
returns table (
  id uuid,
  pro_id uuid,
  pro_name text,
  reason text,
  details text,
  created_at timestamptz,
  resolved_at timestamptz
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
    select r.id, r.pro_id, pr.full_name, r.reason, r.details, r.created_at, r.resolved_at
    from public.pro_reports r
    left join public.profiles pr on pr.id = r.pro_id
    order by (r.resolved_at is not null), r.created_at desc
    limit 200;
end;
$$;

create or replace function public.count_open_pro_reports()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Solo administradores.' using errcode = '42501';
  end if;

  return (select count(*) from public.pro_reports r where r.resolved_at is null);
end;
$$;

create or replace function public.resolve_pro_report(p_report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Solo administradores.' using errcode = '42501';
  end if;

  update public.pro_reports
     set resolved_at = now()
   where id = p_report and resolved_at is null;

  if not found then
    raise exception 'El reporte no existe o ya está resuelto.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.list_pro_reports() from public, anon;
revoke all on function public.count_open_pro_reports() from public, anon;
revoke all on function public.resolve_pro_report(uuid) from public, anon;
grant execute on function public.list_pro_reports() to authenticated;
grant execute on function public.count_open_pro_reports() to authenticated;
grant execute on function public.resolve_pro_report(uuid) to authenticated;
