-- 0032 D5-d: enforce client standing from private ratings (spec Section 5).
-- A low rating is recorded in private_client_ratings.is_low (migration 0030).
-- Rule: 3 or more low ratings in the last 90 days -> warning.
--       5 or more -> the client cannot create new job requests.
-- An admin can clear the count. Only ratings after the clear count afterwards.

-- 1. Admin clears (audit trail). --------------------------------------------------------
create table if not exists public.client_rating_clears (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles (id),
  cleared_by  uuid not null references public.profiles (id),
  reason      text not null check (char_length(btrim(reason)) >= 10),
  cleared_at  timestamptz not null default now()
);

alter table public.client_rating_clears enable row level security;
drop policy if exists client_rating_clears_admin on public.client_rating_clears;
create policy client_rating_clears_admin on public.client_rating_clears
  for select using (public.is_admin());
revoke insert, update, delete on public.client_rating_clears from authenticated, anon;

-- 2. Count of low ratings inside the rolling 90-day window, after the last admin clear. --
create or replace function public.client_low_rating_count(p_client uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
    from public.private_client_ratings r
   where r.client_id = p_client
     and r.is_low
     and r.created_at > greatest(
           now() - interval '90 days',
           coalesce(
             (select max(c.cleared_at) from public.client_rating_clears c where c.client_id = p_client),
             '-infinity'::timestamptz
           )
         );
$$;

-- 3. The signed-in client's own standing. Counts only, never the individual ratings. -----
create or replace function public.client_standing()
returns table (low_count integer, warning boolean, blocked boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para ver tu cuenta.';
  end if;
  v_count := public.client_low_rating_count((select auth.uid()));
  return query select v_count, v_count >= 3, v_count >= 5;
end;
$$;

-- 4. Block new job requests at the 5-rating limit. A trigger covers every creation path. --
create or replace function public.block_jobs_over_rating_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.client_low_rating_count(new.homeowner_id) >= 5 then
    raise exception 'Tu cuenta no puede pedir nuevos trabajos por ahora por calificaciones bajas de profesionales. Podrás pedir de nuevo cuando salgan del período de 90 días.';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_block_over_rating_limit on public.jobs;
create trigger jobs_block_over_rating_limit
  before insert on public.jobs
  for each row execute function public.block_jobs_over_rating_limit();

-- 5. Admin clears the count for a client, with a reason. ---------------------------------
create or replace function public.clear_client_rating_limit(p_client uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede limpiar este contador.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Escribe el motivo (mínimo 10 caracteres).'; end if;
  insert into public.client_rating_clears (client_id, cleared_by, reason)
  values (p_client, (select auth.uid()), btrim(p_reason));
end;
$$;

-- 6. Grants. -----------------------------------------------------------------------------
revoke all on function public.client_low_rating_count(uuid) from public, anon, authenticated;
revoke all on function public.block_jobs_over_rating_limit() from public, anon, authenticated;
revoke all on function public.client_standing() from public, anon;
grant execute on function public.client_standing() to authenticated;
revoke all on function public.clear_client_rating_limit(uuid, text) from public, anon;
grant execute on function public.clear_client_rating_limit(uuid, text) to authenticated;
