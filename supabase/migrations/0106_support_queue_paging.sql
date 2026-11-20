-- 0106: paging for the admin support queue. Same admin gate, same columns, same 200-row page size.
-- Adds p_offset. Ties are broken by id so pages are disjoint and stable.
-- The old one-argument signature is dropped so PostgREST calls do not match two overloads.

drop function if exists public.admin_list_support_tickets(text);

create or replace function public.admin_list_support_tickets(p_status text default null, p_offset integer default 0)
returns table (id uuid, author_id uuid, author_name text, job_id uuid, category text, subject text,
               status text, last_message_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('open', 'answered', 'closed') then
    raise exception 'Estado no válido.';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'Página no válida.' using errcode = '22023';
  end if;
  return query
    select t.id, t.author_id, pr.full_name, t.job_id, t.category, t.subject, t.status, t.last_message_at, t.created_at
      from public.support_tickets t
      join public.profiles pr on pr.id = t.author_id
     where p_status is null or t.status = p_status
     order by case t.status when 'open' then 0 when 'answered' then 1 else 2 end, t.last_message_at desc, t.id
     limit 200
     offset p_offset;
end;
$$;

revoke all on function public.admin_list_support_tickets(text, integer) from public, anon;
grant execute on function public.admin_list_support_tickets(text, integer) to authenticated;
