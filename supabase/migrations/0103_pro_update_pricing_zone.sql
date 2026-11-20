-- 0103: owner edit of price range and zone. Owner-only through a SECURITY DEFINER RPC.
-- The function takes no target id: it writes only the caller's own pros row (auth.uid()).
-- City is never written here: pros_set_city derives it from zone, and pros_zone_by_city checks the pair.
-- Validation mirrors registration: integer prices, min >= 0, max >= min. Registration has no upper cap.
--
-- Guard change (approved): guard_pro_privileges skips the price and zone clause only while
-- listavy.pro_internal reads 'on'. The RPC sets that flag transaction-locally before its UPDATE,
-- the same way pro_free_until works. Every other clause and every other caller path is unchanged.
-- Direct client writes never set the flag, so they stay refused.

-- 1. Guard: identical to 0086 except the price and zone clause.
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
       or new.city is distinct from old.city
       or new.pro_type is distinct from old.pro_type then
      raise exception 'Solo un administrador puede cambiar estos datos.';
    end if;
    -- Price and zone: owner writes only through pro_update_pricing_zone, which sets the flag.
    if (new.zone is distinct from old.zone
        or new.price_min_dop is distinct from old.price_min_dop
        or new.price_max_dop is distinct from old.price_max_dop)
       and coalesce(current_setting('listavy.pro_internal', true), '') <> 'on' then
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

-- 2. The owner RPC. Sets the flag locally, then writes only the caller's row.
create or replace function public.pro_update_pricing_zone(p_price_min integer, p_price_max integer, p_zone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Inicia sesión para editar tu perfil.' using errcode = '42501';
  end if;
  if p_price_min is null or p_price_max is null or p_price_min < 0 or p_price_max < p_price_min then
    raise exception 'Rango de precios no válido.' using errcode = '22023';
  end if;
  if p_zone is null or public.city_of_zone(p_zone) is null then
    raise exception 'Zona no válida.' using errcode = '22023';
  end if;

  perform set_config('listavy.pro_internal', 'on', true);
  update public.pros
     set price_min_dop = p_price_min,
         price_max_dop = p_price_max,
         zone = p_zone
   where id = v_uid;
  if not found then
    raise exception 'No hay perfil de profesional.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.pro_update_pricing_zone(integer, integer, text) from public, anon;
grant execute on function public.pro_update_pricing_zone(integer, integer, text) to authenticated;
