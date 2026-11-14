-- 0052 · Dispute fixes for referral-discounted payments.
-- (a) Partial refund: commission and minimum are computed on the quote Q (charged + referral discount).
--     kept_quote = (charged - refund) + discount. keep_dop stays the client's kept cash (charged basis).
--     Identical to the previous behavior when referral_discount_dop = 0.
-- (b) Redo: when the redo is approved (finish_redo_dispute), the payment returns to 'held' and releases on
--     the normal schedule: release_after = now() + 24 h.
-- (c) payments_keep_split_consistent now includes referral_discount_dop, matching payments_split_consistent.
-- Applied to project qmugoumizvtvuzndhosq as dispute_partial_quote_basis_and_redo_release and
-- payments_keep_split_referral. Tests run in rolled-back transactions: 6,000/500, 5,000 edge, no discount, redo.

create or replace function public.resolve_dispute(p_dispute uuid, p_outcome text, p_refund_dop integer default null::integer, p_reason text default null::text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  d record;
  p record;
  j record;
  v_pro uuid;
  v_plan text;
  v_rate integer;
  v_refund_dop integer;
  v_refund_minor bigint;
  v_kept_dop integer;
  v_kept_minor bigint;
  v_quote integer;
  v_kept_quote integer;
  v_kept_comm integer;
  v_kept_payout integer;
  v_balance bigint;
  v_other uuid;
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'Solo el administrador puede resolver una disputa.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'Escribe la razón de la decisión (mínimo 10 caracteres).';
  end if;

  select * into d from public.disputes where id = p_dispute for update;
  if not found then raise exception 'Disputa no encontrada.'; end if;
  if d.status <> 'open' or d.stage <> 'evidence' then raise exception 'La disputa ya fue decidida.'; end if;
  if now() < d.evidence_due_at then raise exception 'La ventana de evidencia aún no vence.'; end if;

  select * into p from public.payments where id = d.payment_id for update;
  select * into j from public.jobs where id = d.job_id;
  v_pro := j.pro_id;
  select plan into v_plan from public.pros where id = v_pro;

  if d.phase = 'pre_release' then
    if p.status <> 'disputed' then raise exception 'El pago no está congelado.'; end if;

    if p_outcome = 'release_full' then
      update public.payments set status = 'held' where id = p.id;

    elsif p_outcome = 'full_refund' then
      v_refund_dop := p.amount_dop;
      insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason, dispute_id)
      values (p.id, d.job_id, v_refund_dop, p.amount_minor, 'dispute_full', d.id);

    elsif p_outcome = 'partial_refund' then
      if p_refund_dop is null or p_refund_dop <= 0 or p_refund_dop >= p.amount_dop then
        raise exception 'El reembolso parcial debe ser mayor que cero y menor que el monto del trabajo.';
      end if;
      v_refund_dop := p_refund_dop;
      v_refund_minor := round(p.amount_minor::numeric * v_refund_dop / p.amount_dop)::bigint;
      -- Client's kept cash (charged basis).
      v_kept_dop := p.amount_dop - v_refund_dop;
      v_kept_minor := p.amount_minor - v_refund_minor;
      -- Quote basis: the referral discount is part of the job price the pro earns on.
      v_quote := p.amount_dop + coalesce(p.referral_discount_dop, 0);
      v_kept_quote := v_kept_dop + coalesce(p.referral_discount_dop, 0);

      v_rate := case
        when j.job_type = 'diagnostic' then 15
        when v_plan = 'pro' then 8
        when v_quote < 5000 then 15
        when v_quote <= 25000 then 12
        else 10
      end;
      v_kept_comm := floor((v_kept_quote * v_rate * 2 + 100) / 200);
      if j.job_type = 'repair' and v_plan <> 'pro' and v_kept_comm < 400 then
        v_kept_comm := 400;
      end if;
      if j.job_type = 'repair' and v_kept_comm > 15000 then
        v_kept_comm := 15000;
      end if;
      v_kept_comm := least(v_kept_comm, v_kept_quote);
      v_kept_payout := v_kept_quote - v_kept_comm;

      update public.payments
         set keep_dop = v_kept_dop,
             keep_minor = v_kept_minor,
             keep_pro_payout_dop = v_kept_payout,
             keep_commission_dop = v_kept_comm
       where id = p.id;
      insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason, dispute_id)
      values (p.id, d.job_id, v_refund_dop, v_refund_minor, 'dispute_partial', d.id);

    elsif p_outcome = 'redo' then
      null;

    else
      raise exception 'Resultado no válido.';
    end if;

  else
    if p.status <> 'released' then raise exception 'El pago ya no está liberado.'; end if;
    if p_outcome = 'full_refund' then
      v_refund_dop := p.amount_dop;
    elsif p_outcome = 'partial_refund' then
      v_refund_dop := p_refund_dop;
    else
      raise exception 'Después de la liberación solo hay reembolso desde la reserva.';
    end if;
    if v_refund_dop is null or v_refund_dop <= 0 or v_refund_dop > p.amount_dop then
      raise exception 'El reembolso excede el monto del trabajo.';
    end if;

    lock table public.guarantee_reserve in share row exclusive mode;
    select coalesce(sum(case when entry_kind = 'funding' then amount_dop else -amount_dop end), 0)
      into v_balance from public.guarantee_reserve;
    if v_balance < v_refund_dop then raise exception 'Reserva de garantía insuficiente.'; end if;

    v_refund_minor := round(p.amount_minor::numeric * v_refund_dop / p.amount_dop)::bigint;
    insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason, dispute_id)
    values (p.id, d.job_id, v_refund_dop, v_refund_minor, 'guarantee_refund', d.id);
    insert into public.pro_recoveries (pro_id, dispute_id, amount_dop)
    values (v_pro, d.id, v_refund_dop);
  end if;

  update public.disputes
     set decided_at = now(),
         decided_by = (select auth.uid()),
         decision_reason = trim(p_reason),
         outcome = p_outcome,
         refund_dop = v_refund_dop,
         stage = case when p_outcome = 'redo' then 'decided' else 'executed' end
   where id = d.id;

  if p_outcome = 'redo' then
    return 'redo_pending';
  end if;

  update public.disputes
     set status = case when p_outcome = 'release_full' then 'resolved_pro' else 'resolved_homeowner' end,
         resolved_at = now()
   where id = d.id;

  insert into public.dispute_notifications (dispute_id, recipient_id, kind, body)
  select d.id, x, 'decision', 'La disputa fue decidida. Motivo: ' || trim(p_reason) || ' Esta decisión es final en la plataforma.'
    from unnest(array[j.homeowner_id, j.pro_id]) as x
   where x is not null;

  return 'resolved';
end;
$function$;

create or replace function public.finish_redo_dispute(p_dispute uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment uuid;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede cerrar un rediseño.'; end if;
  update public.disputes
     set stage = 'executed', status = 'resolved_pro', resolved_at = now()
   where id = p_dispute and outcome = 'redo' and stage = 'decided' and status = 'open'
   returning payment_id into v_payment;
  if not found then raise exception 'La disputa no está esperando un rediseño.'; end if;

  update public.payments
     set status = 'held', release_after = now() + interval '24 hours'
   where id = v_payment and status = 'disputed';
end;
$function$;

revoke all on function public.resolve_dispute(uuid, text, integer, text) from public, anon;
revoke all on function public.finish_redo_dispute(uuid) from public, anon;
grant execute on function public.resolve_dispute(uuid, text, integer, text) to authenticated;
grant execute on function public.finish_redo_dispute(uuid) to authenticated;

-- Keep split now includes the referral discount, matching payments_split_consistent.
alter table public.payments drop constraint if exists payments_keep_split_consistent;
alter table public.payments add constraint payments_keep_split_consistent
  check (keep_dop is null
         or (keep_pro_payout_dop + keep_commission_dop) = (keep_dop + referral_discount_dop));
