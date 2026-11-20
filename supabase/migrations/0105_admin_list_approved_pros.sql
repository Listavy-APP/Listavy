-- 0105: admin list of approved pros, for the view-as doorway (/admin/profesionales).
-- Read-only. Admin-gated with is_admin(), which requires AAL2 (0061), like every admin definer.
-- Returns list columns only: no payout details, documents, phone, or email.
-- Capped at 200 rows, like the support queue.

create or replace function public.admin_list_approved_pros(p_search text default null, p_city text default null, p_trade text default null)
returns table (
  id uuid,
  full_name text,
  trade text,
  zone text,
  city text,
  plan text,
  available boolean,
  is_demo boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_pattern text;
begin
  if not public.is_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  -- Escape LIKE wildcards so the search matches literally.
  v_pattern := '%' || replace(replace(replace(coalesce(trim(p_search), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select p.id, pr.full_name, p.trade, p.zone, p.city, p.plan, p.available, p.is_demo
    from public.pros p
    left join public.profiles pr on pr.id = p.id
    where p.verification_status = 'approved'
      and p.closed_at is null
      and (p_city is null or p.city = p_city)
      and (p_trade is null or p.trade = p_trade)
      and (coalesce(trim(p_search), '') = '' or pr.full_name ilike v_pattern)
    order by pr.full_name nulls last, p.id
    limit 200;
end;
$$;

revoke all on function public.admin_list_approved_pros(text, text, text) from public, anon;
grant execute on function public.admin_list_approved_pros(text, text, text) to authenticated;
