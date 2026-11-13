-- 0038: a blocked pro pauses active boosts; an unblocked pro resumes them, with the end moved forward by the paused time.
-- Refunds count unused days up to the pause moment for paused boosts.
-- Applied to the project after 0037. The bodies below are the applied definitions.

create or replace function public.sync_boosts_with_pro_status()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_blocked_new boolean := new.suspended_at is not null or new.verification_status = 'suspended';
  v_blocked_old boolean := old.suspended_at is not null or old.verification_status = 'suspended';
begin
  if v_blocked_new and not v_blocked_old then
    update public.boosts set status = 'paused', paused_at = now()
     where pro_id = new.id and status = 'active';
  elsif v_blocked_old and not v_blocked_new then
    update public.boosts set
      status = 'active',
      ends_at = ends_at + (now() - paused_at),
      paused_at = null
     where pro_id = new.id and status = 'paused';
  end if;
  return new;
end;
$$;

drop trigger if exists pros_sync_boosts on public.pros;
create trigger pros_sync_boosts
  after update of suspended_at, verification_status on public.pros
  for each row execute function public.sync_boosts_with_pro_status();

update public.boosts set status = 'paused', paused_at = now()
 where status = 'active'
   and pro_id in (select id from public.pros where suspended_at is not null or verification_status = 'suspended');

create or replace function public.boost_refund_dop(p_boost uuid)
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  b record;
  v_suspended boolean;
  v_at timestamptz;
  v_days integer;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede calcular reembolsos.'; end if;

  select * into b from public.boosts where id = p_boost;
  if not found then raise exception 'Destacado no encontrado.'; end if;

  if b.status = 'refund_due' then return b.amount_dop; end if;
  if b.status not in ('active', 'paused') then
    raise exception 'Este destacado ya no se puede reembolsar.';
  end if;

  select (p.suspended_at is not null or p.verification_status = 'suspended') into v_suspended
    from public.pros p where p.id = b.pro_id;
  if not coalesce(v_suspended, false) then
    raise exception 'Solo se reembolsa un destacado activo si el profesional está bloqueado o suspendido.';
  end if;

  v_at := case when b.status = 'paused' then b.paused_at else now() end;
  v_days := greatest(0, floor(extract(epoch from (b.ends_at - v_at)) / 86400))::integer;
  return floor(b.amount_dop * v_days / b.duration_days)::integer;
end;
$$;

revoke all on function public.boost_refund_dop(uuid) from public, anon;
grant execute on function public.boost_refund_dop(uuid) to authenticated;
