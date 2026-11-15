-- 0072 · Audit log for money movement.
-- mark_payment_released() writes one admin_audit_log row, action 'payout_released', on a real transition.
-- mark_refund_succeeded() writes one row, action 'refund_processed', on a real transition.
-- Neither writes on 'skipped' (idempotent retry), so no duplicate rows.
-- Both run from crons with service_role, so actor_id is NULL. This is expected: the actor is the system.
--
-- Base versions: mark_payment_released from 0021 (current, includes reserve funding),
-- mark_refund_succeeded from 0019 (current). The spec named 0017 and 0019 for the first function;
-- 0021 superseded 0017, so 0021 is the body carried forward.
-- Does NOT change: amounts, commission, payout computation, statuses, release/refund flow,
-- crons, Edge Functions, reserve funding, or grants (service_role only).
-- Not applied. Sam reviews the SQL before it is applied to production.

-- A. Payout released. Log is written after the success check, using the row fields after the update.
create or replace function public.mark_payment_released(p_payment uuid, p_transfer text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_retained integer;
  v_fund integer;
  v_log record;
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

  select p.job_id, j.pro_id, p.amount_dop,
         coalesce(p.keep_pro_payout_dop, p.pro_payout_dop) as payout_dop
    into v_log
    from public.payments p
    join public.jobs j on j.id = p.job_id
   where p.id = p_payment;

  perform public.admin_log(
    'payout_released',
    p_payment,
    jsonb_build_object(
      'payment_id', p_payment,
      'job_id', v_log.job_id,
      'pro_id', v_log.pro_id,
      'payout_dop', v_log.payout_dop,
      'transfer_id', p_transfer,
      'amount_dop', v_log.amount_dop
    )
  );
  return 'released';
end;
$$;

revoke execute on function public.mark_payment_released(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payment_released(uuid, text) to service_role;

-- B. Refund succeeded. Body identical to 0019. Log is written just before the final return.
create or replace function public.mark_refund_succeeded(p_refund uuid, p_stripe_refund text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  r record;
  pm record;
begin
  update public.refunds
     set status = 'succeeded', stripe_refund_id = p_stripe_refund, processed_at = now()
   where id = p_refund and status = 'pending'
   returning * into r;
  if not found then return 'skipped'; end if;

  if r.reason = 'dispute_partial' then
    -- The kept portion goes back to held and is released by the normal schedule.
    update public.payments
       set status = 'held', refunded_minor = refunded_minor + r.amount_minor
     where id = r.payment_id;
  elsif r.reason = 'guarantee_refund' then
    -- Paid from the reserve. The payment stays released; the reserve ledger records the draw.
    update public.payments
       set refunded_minor = refunded_minor + r.amount_minor
     where id = r.payment_id
     returning * into pm;
    insert into public.guarantee_reserve (entry_kind, amount_dop, dispute_id)
    values ('draw', r.amount_dop, r.dispute_id);
    if pm.refunded_minor >= pm.amount_minor then
      update public.jobs set payment_status = 'refunded' where id = r.job_id;
    end if;
  else
    -- Cancellations and full refunds before release.
    update public.payments
       set status = 'refunded', refunded_minor = r.amount_minor
     where id = r.payment_id;
    update public.jobs set payment_status = 'refunded' where id = r.job_id;
  end if;

  perform public.admin_log(
    'refund_processed',
    p_refund,
    jsonb_build_object(
      'refund_id', p_refund,
      'payment_id', r.payment_id,
      'job_id', r.job_id,
      'amount_dop', r.amount_dop,
      'reason', r.reason,
      'dispute_id', r.dispute_id,
      'stripe_refund_id', p_stripe_refund
    )
  );
  return 'succeeded';
end;
$$;

revoke execute on function public.mark_refund_succeeded(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_refund_succeeded(uuid, text) to service_role;
