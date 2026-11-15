-- 0067: a review is held only while a dispute on its job is 'open'.
-- Previously: stage <> 'closed'. resolve_dispute sets stage 'executed' before
-- the dispute closes, so a resolved dispute could keep its review hidden.
-- A redo keeps status 'open', so it still holds the review.
create or replace function public.review_is_held(p_job uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.disputes d where d.job_id = p_job and d.status = 'open');
$$;
