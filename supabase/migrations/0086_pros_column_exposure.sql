-- 0086: stop anon and authenticated from reading sensitive columns on public.pros, and tighten owner writes.
-- NOT APPLIED. Sam reviews, then Fabian approves. Apply and the app merge ship together.
--
-- Why: pros_select_public lets any role read approved pro rows. The table grant gave anon and
-- authenticated SELECT on every column, so stripe_account_id and other internal columns were public.
-- The owner UPDATE path also covered every column, and the guard trigger did not cover suspended_at,
-- stripe_account_id, is_demo, pro_type or the identity columns.
--
-- Fix, in order:
--   1. Policies that read pros.closed_at move that check into a definer helper.
--   2. Owner reads of the four private fields go through get_my_pro_status() (definer, auth.uid() only).
--   3. Admin queue reads go through admin_pending_pros() and admin_pending_pro_count() (definer, is_admin()).
--   4. Table SELECT is revoked from anon and authenticated. Public columns are granted back by name.
--   5. Owner privileges on pros: no DELETE, TRUNCATE, REFERENCES, TRIGGER. UPDATE only on the columns the app writes.
--   6. guard_pro_privileges covers every privileged column (list in the comment on the function).
-- service_role, postgres and Edge Functions are unaffected. list_pro_cards and the boost and Stripe paths are
-- SECURITY DEFINER and are unaffected.

-- 1. Helper for the two policies that read closed_at. Runs as owner, so the column check does not apply to the caller.
create or replace function public.pro_is_open_approved(p_pro text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.pros p
    where p.id::text = p_pro and p.verification_status = 'approved' and p.closed_at is null
  );
$$;
revoke all on function public.pro_is_open_approved(text) from public;
grant execute on function public.pro_is_open_approved(text) to anon, authenticated;

drop policy pro_files_select on public.pro_files;
create policy pro_files_select on public.pro_files
  for select
  using (
    pro_id = (select auth.uid())
    or public.is_admin()
    or (kind = 'work_photo' and public.pro_is_open_approved(pro_id::text))
  );

drop policy work_photos_select on storage.objects;
create policy work_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pro-work-photos'
    and (
      (storage.foldername(name))[1] = ((select auth.uid()))::text
      or public.is_admin()
      or public.pro_is_open_approved((storage.foldername(name))[1])
    )
  );

-- 2. Owner: the four private fields the pro's own status page shows. Returns nothing for anyone else.
create or replace function public.get_my_pro_status()
returns table (
  rejection_reason text,
  pro_free_until timestamptz,
  closed_at timestamptz,
  plan_current_period_end timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select p.rejection_reason, p.pro_free_until, p.closed_at, p.plan_current_period_end
  from public.pros p
  where p.id = (select auth.uid());
$$;
revoke all on function public.get_my_pro_status() from public;
grant execute on function public.get_my_pro_status() to authenticated;

-- 3. Admin queue. Same rows the admin pages showed before: pending, not closed.
create or replace function public.admin_pending_pros(p_limit integer default null)
returns table (
  id uuid,
  trade text,
  zone text,
  city text,
  price_min_dop integer,
  price_max_dop integer,
  created_at timestamptz,
  pro_type text,
  full_name text,
  phone text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'No autorizado.'; end if;
  return query
    select p.id, p.trade, p.zone, p.city, p.price_min_dop, p.price_max_dop, p.created_at, p.pro_type,
           pr.full_name, pr.phone
    from public.pros p
    left join public.profiles pr on pr.id = p.id
    where p.verification_status = 'pending' and p.closed_at is null
    order by p.created_at desc
    limit p_limit;
end;
$$;

create or replace function public.admin_pending_pro_count()
returns integer
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'No autorizado.'; end if;
  return (select count(*)::integer from public.pros p where p.verification_status = 'pending' and p.closed_at is null);
end;
$$;

revoke all on function public.admin_pending_pros(integer) from public;
revoke all on function public.admin_pending_pro_count() from public;
grant execute on function public.admin_pending_pros(integer) to authenticated;
grant execute on function public.admin_pending_pro_count() to authenticated;

-- 4. Column exposure. Table SELECT goes; the public columns come back by name.
revoke select on public.pros from anon, authenticated;
grant select (
  id, trade, zone, city, price_min_dop, price_max_dop, bio, available, is_demo,
  pro_type, verification_status, verified_at, plan, created_at
) on public.pros to anon, authenticated;

-- 5. Owner table privileges. The app writes only bio and available (owner) and the resubmit pair
--    verification_status and rejection_reason. Admins write through SECURITY DEFINER RPCs.
revoke delete, truncate, references, trigger on public.pros from anon, authenticated;
revoke update on public.pros from anon, authenticated;
grant update (bio, available, verification_status, rejection_reason) on public.pros to authenticated;

-- 6. Guard. Owners (auth.uid() not null, not admin) cannot change:
--    verification_status (except the rejected -> pending resubmit), rejection_reason (except clearing it on resubmit),
--    pro_free_until (except via listavy.pro_internal), verified_at, verified_by, plan, plan_stripe_subscription_id,
--    plan_current_period_end, plan_activated_at, closed_at, suspended_at, stripe_account_id, is_demo, pro_type,
--    id, created_at, trade, zone, city, price_min_dop, price_max_dop.
--    Owners may change bio and available. Service role and admins are not affected.
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
       or new.closed_at is distinct from old.closed_at
       or new.suspended_at is distinct from old.suspended_at
       or new.stripe_account_id is distinct from old.stripe_account_id
       or new.is_demo is distinct from old.is_demo then
      raise exception 'Solo un administrador puede verificar, suspender o cambiar el plan.';
    end if;
    if new.id is distinct from old.id
       or new.created_at is distinct from old.created_at
       or new.trade is distinct from old.trade
       or new.zone is distinct from old.zone
       or new.city is distinct from old.city
       or new.price_min_dop is distinct from old.price_min_dop
       or new.price_max_dop is distinct from old.price_max_dop
       or new.pro_type is distinct from old.pro_type then
      raise exception 'Solo un administrador puede cambiar estos datos.';
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
