-- Reserve funding on release (Sprint 3). On each release, 10% of the commission the platform retains
-- goes to the guarantee reserve. For a partial pre-release split, the retained commission is keep_commission_dop.
-- Funding is one row per payment. The unique index makes a repeated release add nothing.

alter table public.guarantee_reserve
  add column if not exists payment_id uuid references public.payments (id);

create unique index if not exists guarantee_reserve_one_funding_per_payment
  on public.guarantee_reserve (payment_id)
  where entry_kind = 'funding';

-- Same signature and grants as 0017. Only the release branch adds the funding row.
create or replace function public.mark_payment_released(p_payment uuid, p_transfer text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_retained integer;
  v_fund integer;
begin
  update public.payments
     set status = 'released', released_at = now(), stripe_transfer_id = p_transfer
   where id = p_payment and status = 'held'
   returning coalesce(keep_commission_dop, commission_dop, 0) into v_retained;
  if not found then return 'skipped'; end if;

  v_fund := round(v_retained * 0.10)::integer;
  if v_fund > 0 then
    insert into public.guarantee_reserve (entry_kind, amount_dop, payment_id)
    values ('funding', v_fund, p_payment)
    on conflict do nothing;
  end if;
  return 'released';
end;
$$;

revoke execute on function public.mark_payment_released(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payment_released(uuid, text) to service_role;
