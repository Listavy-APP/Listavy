-- 0113: nationwide search source for /buscar (Item 12). ADDITIVE ONLY: one new function.
-- Why: list_pro_cards filters by the legacy city, so it cannot list pros nationwide.
-- Returns ids and place only. Cards are then fetched by id through list_pro_cards (by-id contract unchanged).
-- Same visibility rules as the ladder: approved, not closed, not demo.
-- Bounded by p_limit (max 100). total_count is the full match count so the page can say when it truncates.

create or replace function public.search_pros_nationwide(
  p_trade text default null,
  p_limit integer default 60
)
returns table (pro_id uuid, municipality_id uuid, municipality_name text, province text, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select p.id,
         m.id,
         m.name,
         m.province,
         count(*) over()
    from public.pros p
    join public.municipalities m on m.id = p.municipality_id
   where p.verification_status = 'approved'
     and p.closed_at is null
     and not p.is_demo
     and (p_trade is null or p.trade = p_trade)
   order by m.province, m.name, p.id
   limit greatest(1, least(coalesce(p_limit, 60), 100));
end;
$$;

revoke all on function public.search_pros_nationwide(text, integer) from public;
grant execute on function public.search_pros_nationwide(text, integer) to anon, authenticated;
