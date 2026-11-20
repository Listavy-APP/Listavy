-- 0102 · Verified icon: batch read of a pro's current verification stages.
-- NOT APPLIED. Sam reviews first; Fabian approves the apply.
--
-- Returns stage names only, for approved and unexpired stages, the same rule as
-- pro_current_verifications (0074). No dates, no documents, no notes.
-- The app decides the icon with the domain rules (identity + selfie; company set), so the
-- rule lives in one place. pro_verifications stays owner and admin only.
-- Anon and authenticated may call it: the public profile already shows these stages (0074).

create or replace function public.pro_verified_flags(p_pro_ids uuid[])
returns table (pro_id uuid, stages text[])
language sql
stable
security definer
set search_path = ''
as $$
  select v.pro_id, array_agg(distinct v.stage order by v.stage)
    from public.pro_verifications v
   where v.pro_id = any (coalesce(p_pro_ids, '{}'::uuid[]))
     and v.status = 'approved'
     and (v.expires_at is null or v.expires_at >= current_date)
   group by v.pro_id;
$$;

revoke execute on function public.pro_verified_flags(uuid[]) from public;
grant execute on function public.pro_verified_flags(uuid[]) to anon, authenticated;
