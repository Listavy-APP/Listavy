-- 0097 · Support tickets (queue item 8a).
-- In-app tickets so user problems are tracked, not only sitting in the soporte@ inbox.
-- Authors read and reply on their own tickets. Admins work through is_admin()-gated definers, and
-- every admin action writes to the audit log (admin_log). Tickets never replace disputes.

-- ---------------------------------------------------------------------------
-- 1. Tables.
-- ---------------------------------------------------------------------------

create table public.support_tickets (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null references public.profiles (id) on delete cascade,
  job_id           uuid references public.jobs (id),
  category         text not null check (category in ('cuenta', 'pagos', 'trabajo', 'verificacion', 'otro')),
  subject          text not null check (char_length(btrim(subject)) between 3 and 120),
  status           text not null default 'open' check (status in ('open', 'answered', 'closed')),
  last_message_at  timestamptz not null default now(),
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((status = 'closed') = (closed_at is not null))
);

create index support_tickets_author_idx on public.support_tickets (author_id, status);
create index support_tickets_queue_idx on public.support_tickets (status, last_message_at);

create table public.support_ticket_messages (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references public.support_tickets (id) on delete cascade,
  author_id    uuid not null references public.profiles (id),
  from_admin   boolean not null default false,
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at   timestamptz not null default now()
);

create index support_ticket_messages_ticket_idx on public.support_ticket_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

-- Authors only. Admins read through the definers below, so there is no admin policy here.
create policy support_tickets_select_author on public.support_tickets
  for select to authenticated
  using (author_id = (select auth.uid()));

create policy support_ticket_messages_select_author on public.support_ticket_messages
  for select to authenticated
  using (exists (select 1 from public.support_tickets t where t.id = ticket_id and t.author_id = (select auth.uid())));

revoke all on public.support_tickets from public, anon, authenticated;
revoke all on public.support_ticket_messages from public, anon, authenticated;
grant select on public.support_tickets to authenticated;
grant select on public.support_ticket_messages to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Client definers.
-- ---------------------------------------------------------------------------

-- Open tickets are those not closed. A user may hold at most five at once.
create or replace function public.create_support_ticket(p_category text, p_subject text, p_body text, p_job uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_open integer;
begin
  if v_uid is null then raise exception 'Debes entrar primero.'; end if;
  if p_category not in ('cuenta', 'pagos', 'trabajo', 'verificacion', 'otro') then
    raise exception 'Elige una categoría.';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) < 3 or char_length(btrim(p_subject)) > 120 then
    raise exception 'El asunto debe tener entre 3 y 120 caracteres.';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 or char_length(btrim(p_body)) > 2000 then
    raise exception 'El mensaje debe tener entre 1 y 2000 caracteres.';
  end if;
  if p_job is not null and not exists (
    select 1 from public.jobs j where j.id = p_job and (j.homeowner_id = v_uid or j.pro_id = v_uid)
  ) then
    raise exception 'Ese trabajo no es tuyo.';
  end if;

  select count(*) into v_open from public.support_tickets where author_id = v_uid and status <> 'closed';
  if v_open >= 5 then
    raise exception 'Ya tienes 5 tickets abiertos. Cierra uno o espera una respuesta antes de abrir otro.';
  end if;

  insert into public.support_tickets (author_id, job_id, category, subject)
  values (v_uid, p_job, p_category, btrim(p_subject))
  returning id into v_id;

  insert into public.support_ticket_messages (ticket_id, author_id, from_admin, body)
  values (v_id, v_uid, false, btrim(p_body));

  -- Admins: push only, in the admin's own preference. The queue page holds the detail.
  perform public.notify_user_push(p.id, 'support_new_ticket', 'Nuevo ticket de soporte',
    'Un usuario abrió un ticket. Revísalo en la bandeja de soporte.', '/admin/soporte', false)
  from public.profiles p where p.role = 'admin';

  return v_id;
end;
$$;

-- A user reply. An answered ticket goes back to open. A closed ticket takes no replies: open a new one.
create or replace function public.reply_support_ticket(p_ticket uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  t record;
begin
  if v_uid is null then raise exception 'Debes entrar primero.'; end if;
  select * into t from public.support_tickets where id = p_ticket and author_id = v_uid for update;
  if not found then raise exception 'No encontramos ese ticket.'; end if;
  if t.status = 'closed' then raise exception 'Este ticket está cerrado. Abre uno nuevo si necesitas ayuda.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 or char_length(btrim(p_body)) > 2000 then
    raise exception 'El mensaje debe tener entre 1 y 2000 caracteres.';
  end if;

  insert into public.support_ticket_messages (ticket_id, author_id, from_admin, body)
  values (p_ticket, v_uid, false, btrim(p_body));

  update public.support_tickets
     set status = 'open', last_message_at = now(), updated_at = now()
   where id = p_ticket;

  perform public.notify_user_push(p.id, 'support_user_reply', 'Nuevo mensaje en un ticket',
    'Un usuario respondió en un ticket de soporte.', '/admin/soporte', false)
  from public.profiles p where p.role = 'admin';
end;
$$;

-- Close one's own ticket. Closing is final; a new problem gets a new ticket.
create or replace function public.close_support_ticket(p_ticket uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Debes entrar primero.'; end if;
  update public.support_tickets
     set status = 'closed', closed_at = now(), updated_at = now()
   where id = p_ticket and author_id = v_uid and status <> 'closed';
  if not found then raise exception 'No encontramos ese ticket o ya está cerrado.'; end if;
end;
$$;

revoke execute on function public.create_support_ticket(text, text, text, uuid) from public, anon;
grant execute on function public.create_support_ticket(text, text, text, uuid) to authenticated;
revoke execute on function public.reply_support_ticket(uuid, text) from public, anon;
grant execute on function public.reply_support_ticket(uuid, text) to authenticated;
revoke execute on function public.close_support_ticket(uuid) from public, anon;
grant execute on function public.close_support_ticket(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin definers. Every function checks is_admin() and every write is logged.
-- ---------------------------------------------------------------------------

-- Queue: open first, then answered, then closed. Newest activity first within each group.
create or replace function public.admin_list_support_tickets(p_status text default null)
returns table (id uuid, author_id uuid, author_name text, job_id uuid, category text, subject text,
               status text, last_message_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('open', 'answered', 'closed') then
    raise exception 'Estado no válido.';
  end if;
  return query
    select t.id, t.author_id, pr.full_name, t.job_id, t.category, t.subject, t.status, t.last_message_at, t.created_at
      from public.support_tickets t
      join public.profiles pr on pr.id = t.author_id
     where p_status is null or t.status = p_status
     order by case t.status when 'open' then 0 when 'answered' then 1 else 2 end, t.last_message_at desc
     limit 200;
end;
$$;

create or replace function public.admin_list_support_messages(p_ticket uuid)
returns table (id uuid, from_admin boolean, body text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return query
    select m.id, m.from_admin, m.body, m.created_at
      from public.support_ticket_messages m
     where m.ticket_id = p_ticket
     order by m.created_at, m.id;
end;
$$;

-- Count for the sidebar badge: open tickets only.
create or replace function public.admin_support_open_count()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return (select count(*)::int from public.support_tickets where status = 'open');
end;
$$;

-- Admin reply. The ticket becomes answered. The author gets push and email (verified address only).
create or replace function public.admin_reply_support_ticket(p_ticket uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  t record;
begin
  if not public.is_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found then raise exception 'No encontramos ese ticket.'; end if;
  if t.status = 'closed' then raise exception 'Este ticket está cerrado. Reábrelo para responder.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 or char_length(btrim(p_body)) > 2000 then
    raise exception 'El mensaje debe tener entre 1 y 2000 caracteres.';
  end if;

  insert into public.support_ticket_messages (ticket_id, author_id, from_admin, body)
  values (p_ticket, v_uid, true, btrim(p_body));

  update public.support_tickets
     set status = 'answered', last_message_at = now(), updated_at = now()
   where id = p_ticket;

  perform public.admin_log('support_reply', t.author_id, jsonb_build_object('ticket_id', p_ticket));

  perform public.notify_user_push(t.author_id, 'support_reply', 'Respondimos tu ticket',
    'Hay una respuesta en tu ticket de soporte.', '/ayuda/tickets/' || p_ticket, false);
  perform public.notify_user_email(t.author_id, 'support_reply',
    jsonb_build_object('ticket_id', p_ticket, 'subject', t.subject), true, false);
end;
$$;

-- Close or reopen. Reopening sets open. Both are logged.
create or replace function public.admin_set_support_ticket_status(p_ticket uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
begin
  if not public.is_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if p_status not in ('open', 'closed') then raise exception 'Acción no válida.'; end if;
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found then raise exception 'No encontramos ese ticket.'; end if;
  if t.status = p_status then raise exception 'El ticket ya está así.'; end if;

  update public.support_tickets
     set status = p_status,
         closed_at = case when p_status = 'closed' then now() else null end,
         updated_at = now()
   where id = p_ticket;

  perform public.admin_log('support_status', t.author_id, jsonb_build_object('ticket_id', p_ticket, 'status', p_status));
end;
$$;

revoke execute on function public.admin_list_support_tickets(text) from public, anon;
grant execute on function public.admin_list_support_tickets(text) to authenticated;
revoke execute on function public.admin_list_support_messages(uuid) from public, anon;
grant execute on function public.admin_list_support_messages(uuid) to authenticated;
revoke execute on function public.admin_support_open_count() from public, anon;
grant execute on function public.admin_support_open_count() to authenticated;
revoke execute on function public.admin_reply_support_ticket(uuid, text) from public, anon;
grant execute on function public.admin_reply_support_ticket(uuid, text) to authenticated;
revoke execute on function public.admin_set_support_ticket_status(uuid, text) from public, anon;
grant execute on function public.admin_set_support_ticket_status(uuid, text) to authenticated;
