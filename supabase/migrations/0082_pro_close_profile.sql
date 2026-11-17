-- 0082: A pro can close their pro profile. History is kept. The account stays and can be used as a client.
--
-- What closing does (close_pro_profile, called by the close-pro-profile Edge Function after the
-- Stripe plan subscription is cancelled):
--   * Refused while the pro has open jobs, money not yet released, an open dispute, or an unpaid recovery.
--   * Pending quotes (invited or sent) are withdrawn. No money is committed on them.
--   * pros.closed_at is set, pros.available is false, and the plan is set to free with no subscription.
--   * profiles.role goes back to 'homeowner'. The pro-only screens and routes then stop applying.
--   * Hidden from search (list_pro_cards), boosted lists (boosted_pro_ids, is_pro_boosted),
--     work photos (pro_files and storage policies), and new quotes (trigger).
--
-- What is kept: jobs, payments, ledger rows, reviews, disputes, pro_files (ID, work photos),
-- pro_companies (RNC), pro_verifications, and the profiles row. Nothing is deleted.
-- Decision pending (Fabian): retention period and whether verification files are removed.
--
-- Reopening: not self-service. Only an admin clears pros.closed_at (see the report).
-- A closed pro cannot re-apply: the registration page already redirects an account with a pros row.
--
-- Changes also here:
--   * guard_pro_privileges: owners cannot change closed_at.
--   * anonymise_customer: a closed pro can delete their account. An active pro still cannot.
--
-- Callable by the service role only, except pro_close_blockers (read-only, same grant).

-- 1. Column.
alter table public.pros add column if not exists closed_at timestamptz;

-- 2. Guard: owners cannot change closed_at. Otherwise identical to 0080.
create or replace function public.guard_pro_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.verification_status is distinct from old.verification_status
       and not (old.verification_status = 'rejected' and new.verification_status = 'pending' and old.closed_at is null) then
      raise exception 'Solo un administrador puede verificar, suspender o cambiar el plan.';
    end if;
    if new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by
       or new.plan is distinct from old.plan
       or new.plan_stripe_subscription_id is distinct from old.plan_stripe_subscription_id
       or new.plan_current_period_end is distinct from old.plan_current_period_end
       or new.plan_activated_at is distinct from old.plan_activated_at
       or new.closed_at is distinct from old.closed_at then
      raise exception 'Solo un administrador puede verificar, suspender o cambiar el plan.';
    end if;
    if new.rejection_reason is distinct from old.rejection_reason
       and not (new.verification_status = 'pending' and new.rejection_reason is null) then
      raise exception 'Solo un administrador puede registrar el motivo.';
    end if;
    if new.pro_free_until is distinct from old.pro_free_until
       and coalesce(current_setting('listavy.pro_internal', true), '') <> 'on' then
      raise exception 'El mes gratis lo asigna Listavy.';
    end if;
  end if;
  return new;
end;
$$;

-- 3. Blockers. Returns the reason codes that block closing. Empty array means the pro may close.
create or replace function public.pro_close_blockers(p_pro uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when exists (
      select 1 from public.jobs j
       where j.pro_id = p_pro and j.status in ('accepted', 'in_progress', 'awaiting_approval', 'disputed')
    ) then 'open_jobs' end,
    case when exists (
      select 1 from public.payments p join public.jobs j on j.id = p.job_id
       where j.pro_id = p_pro and p.status in ('pending', 'held', 'disputed')
    ) then 'money_owed' end,
    case when exists (
      select 1 from public.disputes d join public.jobs j on j.id = d.job_id
       where j.pro_id = p_pro and d.status = 'open'
    ) then 'open_dispute' end,
    case when exists (
      select 1 from public.pro_recoveries r where r.pro_id = p_pro and r.status = 'owed'
    ) then 'recovery_owed' end
  ], null);
$$;

revoke execute on function public.pro_close_blockers(uuid) from public, anon, authenticated;
grant execute on function public.pro_close_blockers(uuid) to service_role;

-- 4. Close. Locks the pro row, re-checks the blockers (race-safe), and records the close.
create or replace function public.close_pro_profile(p_pro uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pro record;
  v_blockers text[];
  v_first text;
  v_message text;
begin
  select id, closed_at into v_pro from public.pros where id = p_pro for update;
  if not found then raise exception 'Este perfil profesional no existe.'; end if;
  if v_pro.closed_at is not null then return 'already_closed'; end if;

  v_blockers := public.pro_close_blockers(p_pro);
  if array_length(v_blockers, 1) > 0 then
    v_first := v_blockers[1];
    v_message := case v_first
      when 'open_jobs' then 'Tienes trabajos abiertos. Termínalos antes de cerrar tu perfil.'
      when 'money_owed' then 'Tienes pagos pendientes de liberar. Espera a que se liberen antes de cerrar tu perfil.'
      when 'open_dispute' then 'Tienes una disputa abierta. Espera a que se resuelva antes de cerrar tu perfil.'
      when 'recovery_owed' then 'Tienes un saldo pendiente con Listavy. Págalo antes de cerrar tu perfil.'
      else 'No puedes cerrar tu perfil todavía.'
    end;
    raise exception '%', v_message;
  end if;

  update public.quotes set status = 'withdrawn'
   where pro_id = p_pro and status in ('invited', 'sent');

  update public.pros
     set closed_at = now(),
         available = false,
         plan = 'free',
         plan_stripe_subscription_id = null,
         plan_current_period_end = null
   where id = p_pro;

  -- Back to a client account. The pro-only screens stop applying.
  update public.profiles set role = 'homeowner' where id = p_pro and role = 'pro';

  return 'closed';
end;
$$;

revoke execute on function public.close_pro_profile(uuid) from public, anon, authenticated;
grant execute on function public.close_pro_profile(uuid) to service_role;

-- 5. No new quotes to a closed pro (covers invites made after the close).
create or replace function public.quotes_block_closed_pro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.pros p where p.id = new.pro_id and p.closed_at is not null) then
    raise exception 'Este profesional cerró su perfil.';
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_block_closed_pro on public.quotes;
create trigger quotes_block_closed_pro
  before insert on public.quotes
  for each row execute function public.quotes_block_closed_pro();

-- 6. Public search: closed pros are not listed. Otherwise identical to 0062.
create or replace function public.list_pro_cards(p_trade text default null, p_zone text default null,
                                      p_pro_id uuid default null, p_city text default 'santo_domingo',
                                      p_pro_type text default null)
returns table(id uuid, full_name text, trade text, zone text, price_min_dop integer, price_max_dop integer,
              plan text, verified_at timestamptz, avatar_path text, bio text, identity_verified boolean,
              email_verified boolean, phone_verified boolean, available boolean, is_demo boolean,
              pro_type text, razon_social text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, pr.full_name, p.trade, p.zone, p.price_min_dop, p.price_max_dop, p.plan, p.verified_at,
         (select f.storage_path from public.pro_files f
           where f.pro_id = p.id and f.kind = 'avatar' and f.review_status = 'approved'
           order by f.created_at desc limit 1) as avatar_path,
         p.bio,
         (p.verified_at is not null) as identity_verified,
         (pr.email_verified_at is not null) as email_verified,
         (pr.phone is not null) as phone_verified,
         p.available,
         p.is_demo,
         p.pro_type,
         case when p.pro_type = 'company'
              then (select c.razon_social from public.pro_companies c where c.pro_id = p.id)
         end as razon_social
  from public.pros p
  join public.profiles pr on pr.id = p.id
  where p.verification_status = 'approved'
    and p.closed_at is null
    and p.city = p_city
    and (p_trade is null or p.trade = p_trade)
    and (p_zone is null or p.zone = p_zone)
    and (p_pro_id is null or p.id = p_pro_id)
    and (p_pro_type is null or p_pro_type = 'any' or p.pro_type = p_pro_type)
    and (not p.is_demo or p_pro_id is not null)
  order by p.verified_at desc nulls last
  limit 50;
$$;

-- 7. Boosts: a closed pro's boost is not shown. The boost row is kept (see report on refunds).
-- Rebuilt from 0058 (keeps p_city and the demo exclusion). Only closed_at is added.
create or replace function public.boosted_pro_ids(p_trade text default null, p_zone text default null,
                                                  p_city text default 'santo_domingo')
returns table(pro_id uuid, starts_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.pro_id, b.starts_at
    from public.boosts b
    join public.pros p on p.id = b.pro_id
   where b.status = 'active'
     and b.ends_at > now()
     and p.verification_status = 'approved'
     and p.suspended_at is null
     and p.closed_at is null
     and not p.is_demo
     and p.city = p_city
     and (p_trade is null or p.trade = p_trade)
     and (p_zone is null or p.zone = p_zone)
   order by b.starts_at desc
   limit 3;
$$;

create or replace function public.is_pro_boosted(p_pro uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.boosts b
      join public.pros p on p.id = b.pro_id
     where b.pro_id = p_pro
       and b.status = 'active'
       and b.ends_at > now()
       and p.verification_status = 'approved'
       and p.suspended_at is null
       and p.closed_at is null
  );
$$;

-- 8. Work photos: approved pros only while open. The owner and admins still see their own.
drop policy if exists pro_files_select on public.pro_files;
create policy pro_files_select on public.pro_files for select
  using (
    pro_id = (select auth.uid())
    or public.is_admin()
    or (kind = 'work_photo' and exists (
          select 1 from public.pros p
          where p.id = pro_files.pro_id and p.verification_status = 'approved' and p.closed_at is null))
  );

drop policy if exists work_photos_select on storage.objects;
create policy work_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'pro-work-photos' and (
           (storage.foldername(name))[1] = (select auth.uid())::text
           or public.is_admin()
           or exists (select 1 from public.pros p
                      where p.id::text = (storage.foldername(name))[1]
                        and p.verification_status = 'approved'
                        and p.closed_at is null)));

-- 9. Account deletion. A closed pro may delete the account. An active pro may not. Otherwise
--    identical to 0012. Closed-pro history stays (the profile row is a tombstone).
create or replace function public.anonymise_customer(p_customer uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_avatars text[];
  v_files text[];
  v_blockers text[];
begin
  if exists (select 1 from public.pros where id = p_customer and closed_at is null) then
    raise exception 'Cierra tu perfil profesional antes de eliminar la cuenta.';
  end if;
  if exists (select 1 from public.pros where id = p_customer) then
    v_blockers := public.pro_close_blockers(p_customer);
    if array_length(v_blockers, 1) > 0 then
      raise exception 'Tienes pagos, trabajos o saldos pendientes como profesional. Espera a que se resuelvan antes de eliminar la cuenta.';
    end if;
  end if;
  if exists (select 1 from public.jobs
              where homeowner_id = p_customer and status not in ('completed', 'cancelled')) then
    raise exception 'Tienes trabajos abiertos. Ciérralos antes de eliminar la cuenta.';
  end if;
  if exists (select 1 from public.payments p join public.jobs j on j.id = p.job_id
              where j.homeowner_id = p_customer and p.status in ('pending', 'held', 'disputed')) then
    raise exception 'Tienes pagos retenidos o en disputa. Espera a que se liberen antes de eliminar la cuenta.';
  end if;
  if exists (select 1 from public.disputes d join public.jobs j on j.id = d.job_id
              where d.status = 'open' and (j.homeowner_id = p_customer or d.opened_by = p_customer)) then
    raise exception 'Tienes una disputa abierta. Espera a que se resuelva antes de eliminar la cuenta.';
  end if;

  select array_remove(array[avatar_path], null) into v_avatars
    from public.profiles where id = p_customer;

  select coalesce(array_agg(x), '{}') into v_files from (
    select jp.storage_path as x
      from public.job_photos jp join public.jobs j on j.id = jp.job_id
     where j.homeowner_id = p_customer and jp.kind = 'request'
    union all
    select j.voice_path from public.jobs j
     where j.homeowner_id = p_customer and j.voice_path is not null
  ) s;

  delete from public.job_photos
   where kind = 'request' and job_id in (select id from public.jobs where homeowner_id = p_customer);

  update public.jobs set description = '[eliminado]', voice_path = null
   where homeowner_id = p_customer;
  delete from public.email_verifications where user_id = p_customer;
  update public.profiles
     set full_name = null, phone = null, email = null, email_verified_at = null,
         zone = null, avatar_path = null
   where id = p_customer;

  return jsonb_build_object(
    'avatars', to_jsonb(coalesce(v_avatars, '{}'::text[])),
    'job_files', to_jsonb(coalesce(v_files, '{}'::text[]))
  );
end;
$$;

revoke execute on function public.anonymise_customer(uuid) from public, anon, authenticated;
grant execute on function public.anonymise_customer(uuid) to service_role;

-- 5. Bell count. Rebuilt from 0076. Only the pending-pros count gains closed_at is null,
--    so the badge matches the filtered admin lists.
create or replace function public.admin_notification_summary()
returns table(open_disputes bigint, open_pro_reports bigint, reviews_awaiting_moderation bigint,
              unresolved_job_flags bigint, pending_pro_applications bigint, total bigint, severity text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_disputes bigint;
  v_reports bigint;
  v_reviews bigint;
  v_flags bigint;
  v_pros bigint;
  v_photos bigint;
  v_verifications bigint;
  v_total bigint;
begin
  if not public.is_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;

  select count(*) into v_disputes from public.disputes where status = 'open';
  select count(*) into v_reports from public.pro_reports where resolved_at is null;
  select count(*) into v_reviews from public.reviews where status = 'hidden';
  select count(*) into v_flags from public.job_notifications
    where problem_reported_at is not null and problem_resolved_at is null;
  select count(*) into v_pros from public.pros
    where verification_status = 'pending' and closed_at is null;
  select count(*) into v_photos from public.job_photo_reports where status = 'pending';
  select count(*) into v_verifications from public.pro_verifications where status = 'pending';

  v_total := v_disputes + v_reports + v_reviews + v_flags + v_pros + v_photos + v_verifications;

  return query select
    v_disputes, v_reports, v_reviews, v_flags, v_pros, v_total,
    case when v_disputes > 0 or v_reports > 0 then 'urgent'
         when v_total > 0 then 'attention'
         else 'clear' end;
end;
$function$;
