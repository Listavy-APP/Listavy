-- 0101 · Client onboarding tour: one-time completion stamp.
-- NOT APPLIED. Sam reviews first; Fabian approves the apply.
--
-- Set when a client finishes or skips the first-run tour. The tour shows only while this is null.
-- Replaying the tour from /cuenta does not change it.
--
-- Owner only, by construction:
--   * stamp_client_tour() takes no parameter. It updates the caller's own row (auth.uid()).
--   * security invoker: profiles_update_own (0001) applies, and the function runs as the caller.
--   * Idempotent: coalesce keeps the first completion time.
--   * guard_profile_privileges (0040) does not check this column.
-- Eligibility (client, not pro-only, not admin) is decided in the app: src/lib/domain/clientTour.ts.

alter table public.profiles
  add column if not exists client_tour_completed_at timestamptz null;

comment on column public.profiles.client_tour_completed_at is
  'Set once the owner finishes or skips the first-run client tour. Written only through stamp_client_tour().';

create or replace function public.stamp_client_tour()
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.profiles
     set client_tour_completed_at = coalesce(client_tour_completed_at, now())
   where id = (select auth.uid());
$$;

revoke execute on function public.stamp_client_tour() from public, anon;
grant execute on function public.stamp_client_tour() to authenticated;
