-- 0028: stage defaults to 'filed'; admin gate applies to signed-in users (server-side calls have no session).
alter table public.disputes alter column stage set default 'filed';

create or replace function public.resolve_dispute(
  p_dispute uuid, p_outcome text, p_refund_dop integer default null, p_reason text default null
)
returns text
language plpgsql
security definer
set search_path to ''
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
  v_kept_comm integer;
  v_kept_payout integer;
  v_balance bigint;
  v_other uuid;
begin
  -- A signed-in user must be an admin. Calls without a user session are server-side only.
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
      v_kept_dop := p.amount_dop - v_refund_dop;
      v_kept_minor := p.amount_minor - v_refund_minor;

      -- Tier on the ORIGINAL job amount (approved rule), applied to the kept portion.
      v_rate := case
        when j.job_type = 'diagnostic' then 15
        when v_plan = 'pro' then 8
        when p.amount_dop < 5000 then 15
        when p.amount_dop <= 25000 then 12
        else 10
      end;
      v_kept_comm := floor((v_kept_dop * v_rate * 2 + 100) / 200);  -- half up to the peso
      if j.job_type = 'repair' and v_plan <> 'pro' and v_kept_comm < 400 then
        v_kept_comm := 400;                                           -- RD$400 minimum on the kept portion
      end if;
      if j.job_type = 'repair' and v_kept_comm > 15000 then
        v_kept_comm := 15000;                                         -- RD$15,000 cap
      end if;
      v_kept_comm := least(v_kept_comm, v_kept_dop);                  -- commission never exceeds the kept amount
      v_kept_payout := v_kept_dop - v_kept_comm;

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

  -- Decision notices, plain Spanish, to both parties.
  update public.disputes
     set decided_at = now(),
         decided_by = (select auth.uid()),
         decision_reason = trim(p_reason),
         outcome = p_outcome,
         refund_dop = v_refund_dop,
         stage = case when p_outcome = 'redo' then 'decided' else 'executed' end
   where id = d.id;

  if p_outcome = 'redo' then
    update public.disputes set status = 'open' where id = d.id;   -- stays open until the redo is approved
    return 'redo_pending';
  end if;

  update public.disputes
     set status = case when p_outcome = 'release_full' then 'resolved_pro' else 'resolved_homeowner' end,
         resolved_at = now()
   where id = d.id;

  v_other := null;
  insert into public.dispute_notifications (dispute_id, recipient_id, kind, body)
  select d.id, x, 'decision', 'La disputa fue decidida. Motivo: ' || trim(p_reason) || ' Esta decisión es final en la plataforma.'
    from unnest(array[j.homeowner_id, j.pro_id]) as x
   where x is not null;

  return 'resolved';
end;
$function$;

revoke all on function public.resolve_dispute(uuid, text, integer, text) from public;
grant execute on function public.resolve_dispute(uuid, text, integer, text) to authenticated;
