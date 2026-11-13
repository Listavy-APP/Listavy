-- D5 reviews v1 (spec: LISTAVY_D5_REVIEWS_SPEC_FINAL_2026-11-12.md).
-- Replaces the open public-read and direct-insert policies on reviews.
-- All writes go through security definer functions that enforce the spec rules.

-- 1. Reviews: columns for sub-ratings, visibility, edit window, removal reason. ------
alter table public.reviews
  add column if not exists quality      smallint check (quality between 1 and 5),
  add column if not exists punctuality  smallint check (punctuality between 1 and 5),
  add column if not exists cleanliness  smallint check (cleanliness between 1 and 5),
  add column if not exists status       text not null default 'published'
    check (status in ('published', 'hidden', 'removed')),
  add column if not exists status_reason text,
  add column if not exists status_at    timestamptz,
  add column if not exists updated_at   timestamptz not null default now();

alter table public.reviews drop constraint if exists reviews_comment_rules;
alter table public.reviews add constraint reviews_comment_rules check (
  comment is null or char_length(comment) <= 500
);

-- 2. Pro response: one per review, editable once. ------------------------------------
create table if not exists public.review_responses (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null unique references public.reviews (id) on delete cascade,
  pro_id      uuid not null references public.pros (id),
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  edited      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 3. Pro's private rating of the client. Admin-readable only. ------------------------
create table if not exists public.private_client_ratings (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null unique references public.jobs (id),
  pro_id       uuid not null references public.pros (id),
  client_id    uuid not null references public.profiles (id),
  punctuality  smallint not null check (punctuality between 1 and 5),
  clarity      smallint not null check (clarity between 1 and 5),
  payment      smallint not null check (payment between 1 and 5),
  is_low       boolean not null,
  created_at   timestamptz not null default now()
);

-- 4. Flags. Any signed-in user can flag a review once. -------------------------------
create table if not exists public.review_flags (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.reviews (id) on delete cascade,
  flagged_by  uuid not null references public.profiles (id),
  reason      text not null check (reason in ('personal_data', 'abuse', 'false_claim', 'advertising', 'other')),
  created_at  timestamptz not null default now(),
  unique (review_id, flagged_by)
);

alter table public.review_responses       enable row level security;
alter table public.private_client_ratings enable row level security;
alter table public.review_flags           enable row level security;

-- 5. Helpers. -----------------------------------------------------------------------
-- A review is held while any dispute on its job is not closed (spec section 6).
create or replace function public.review_is_held(p_job uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.disputes d where d.job_id = p_job and d.stage <> 'closed');
$$;

-- Contact details are blocked at submit (spec D5-e): phones, emails, links, handles.
create or replace function public.review_text_has_contact(p_text text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_text ~* '(https?://|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})'
      or p_text ~* '(instagram|facebook|whatsapp|telegram|tiktok)'
      or p_text ~ '@[a-z0-9_.]{3,}'
      or p_text ~ '(\+?\d[\d\s().-]{6,}\d)';
$$;

-- 6. Policies: public sees published, non-held reviews only. -------------------------
drop policy if exists reviews_select_public on public.reviews;
drop policy if exists reviews_insert_homeowner on public.reviews;

create policy reviews_select_visible on public.reviews for select
  using (
    public.is_admin()
    or reviewer_id = (select auth.uid())
    or pro_id = (select auth.uid())
    or (status = 'published' and not public.review_is_held(job_id))
  );

create policy review_responses_select on public.review_responses for select
  using (
    public.is_admin()
    or pro_id = (select auth.uid())
    or exists (select 1 from public.reviews r where r.id = review_id
               and (status = 'published' and not public.review_is_held(r.job_id)))
  );

create policy private_client_ratings_admin on public.private_client_ratings for select
  using (public.is_admin() or pro_id = (select auth.uid()));

create policy review_flags_admin on public.review_flags for select
  using (public.is_admin() or flagged_by = (select auth.uid()));

-- Direct writes are closed. Functions below are the only write path.
revoke insert, update, delete on public.reviews from authenticated, anon;

-- 7. Submit a review (homeowner, after platform-paid completion). --------------------
create or replace function public.submit_review(
  p_job uuid, p_rating integer, p_quality integer, p_punctuality integer,
  p_cleanliness integer, p_comment text
)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  j record;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_id uuid;
begin
  select * into j from public.jobs where id = p_job;
  if not found or j.homeowner_id <> (select auth.uid()) then
    raise exception 'Solo el cliente de este trabajo puede reseñarlo.';
  end if;
  if j.status <> 'completed' or j.approved_at is null then
    raise exception 'Solo puedes reseñar un trabajo terminado.';
  end if;
  if j.approved_at < now() - interval '30 days' then
    raise exception 'El plazo para reseñar este trabajo ya venció (30 días).';
  end if;
  if public.review_is_held(p_job) then
    raise exception 'Hay una disputa abierta en este trabajo. Podrás reseñar cuando se cierre.';
  end if;
  if not exists (select 1 from public.payments p where p.job_id = p_job and p.status in ('held', 'released')) then
    raise exception 'Solo puedes reseñar trabajos pagados por la plataforma.';
  end if;
  if exists (select 1 from public.refunds r where r.job_id = p_job and r.reason = 'dispute_full' and r.status <> 'failed') then
    raise exception 'Este trabajo fue reembolsado por completo y no se puede reseñar.';
  end if;
  if exists (select 1 from public.reviews where job_id = p_job) then
    raise exception 'Ya reseñaste este trabajo.';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Elige de 1 a 5 estrellas.'; end if;
  if p_quality not between 1 and 5 or p_punctuality not between 1 and 5 or p_cleanliness not between 1 and 5 then
    raise exception 'Elige de 1 a 5 estrellas en cada aspecto.';
  end if;
  if p_rating < 4 and (v_comment is null or char_length(v_comment) < 20) then
    raise exception 'Cuéntanos qué pasó (mínimo 20 caracteres) si calificas con menos de 4 estrellas.';
  end if;
  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'El comentario no puede pasar de 500 caracteres.';
  end if;
  if v_comment is not null and public.review_text_has_contact(v_comment) then
    raise exception 'No incluyas teléfonos, correos, enlaces ni redes sociales en la reseña.';
  end if;

  insert into public.reviews (job_id, reviewer_id, pro_id, rating, quality, punctuality, cleanliness, comment)
  values (p_job, (select auth.uid()), j.pro_id, p_rating, p_quality, p_punctuality, p_cleanliness, v_comment)
  returning id into v_id;
  return v_id;
end;
$function$;

-- 8. Edit a review (reviewer only, 24 hours after posting, not held, not removed). ---
create or replace function public.edit_review(
  p_review uuid, p_rating integer, p_quality integer, p_punctuality integer,
  p_cleanliness integer, p_comment text
)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  r record;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select * into r from public.reviews where id = p_review for update;
  if not found or r.reviewer_id <> (select auth.uid()) then
    raise exception 'Esta reseña no es tuya.';
  end if;
  if r.status = 'removed' then raise exception 'Esta reseña fue retirada.'; end if;
  if r.created_at < now() - interval '24 hours' then
    raise exception 'Solo puedes editar una reseña durante 24 horas después de publicarla.';
  end if;
  if public.review_is_held(r.job_id) then
    raise exception 'Hay una disputa abierta en este trabajo.';
  end if;
  if p_rating < 4 and (v_comment is null or char_length(v_comment) < 20) then
    raise exception 'Cuéntanos qué pasó (mínimo 20 caracteres) si calificas con menos de 4 estrellas.';
  end if;
  if v_comment is not null and (char_length(v_comment) > 500 or public.review_text_has_contact(v_comment)) then
    raise exception 'El comentario no cumple las reglas de la reseña.';
  end if;

  update public.reviews set
    rating = p_rating, quality = p_quality, punctuality = p_punctuality,
    cleanliness = p_cleanliness, comment = v_comment, updated_at = now()
  where id = p_review;
end;
$function$;

-- 9. Pro response (one per review; one edit allowed). --------------------------------
create or replace function public.respond_to_review(p_review uuid, p_body text)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  r record;
  v_body text := btrim(coalesce(p_body, ''));
  existing record;
begin
  select * into r from public.reviews where id = p_review;
  if not found or r.pro_id <> (select auth.uid()) then
    raise exception 'Esta reseña no es de tu perfil.';
  end if;
  if r.status <> 'published' or public.review_is_held(r.job_id) then
    raise exception 'No puedes responder a esta reseña ahora.';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    raise exception 'La respuesta debe tener de 1 a 500 caracteres.';
  end if;
  if public.review_text_has_contact(v_body) then
    raise exception 'No incluyas teléfonos, correos, enlaces ni redes sociales en la respuesta.';
  end if;

  select * into existing from public.review_responses where review_id = p_review;
  if not found then
    insert into public.review_responses (review_id, pro_id, body) values (p_review, r.pro_id, v_body);
  elsif existing.edited then
    raise exception 'Ya editaste tu respuesta. Solo se permite una edición.';
  else
    update public.review_responses set body = v_body, edited = true, updated_at = now()
     where review_id = p_review;
  end if;
end;
$function$;

-- 10. Flag a review. Personal data hides the review at once; others wait for admin. --
create or replace function public.flag_review(p_review uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para reportar.'; end if;
  insert into public.review_flags (review_id, flagged_by, reason)
  values (p_review, (select auth.uid()), p_reason)
  on conflict (review_id, flagged_by) do nothing;

  if p_reason = 'personal_data' then
    update public.reviews set status = 'hidden', status_reason = 'Reportada: datos personales',
           status_at = now()
     where id = p_review and status = 'published';
  end if;
end;
$function$;

-- 11. Admin moderation: publish, hide, or remove. Removal needs a reason. -----------
create or replace function public.moderate_review(p_review uuid, p_action text, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede moderar reseñas.'; end if;
  if p_action not in ('publish', 'hide', 'remove') then raise exception 'Acción no válida.'; end if;
  if p_action in ('hide', 'remove') and char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Escribe el motivo (mínimo 10 caracteres).';
  end if;

  update public.reviews set
    status = case p_action when 'publish' then 'published' when 'hide' then 'hidden' else 'removed' end,
    status_reason = case when p_action = 'publish' then null else btrim(p_reason) end,
    status_at = now()
  where id = p_review;
  if not found then raise exception 'La reseña no existe.'; end if;
end;
$function$;

-- 12. Pro's private rating of the client (after completion, once per job). -----------
create or replace function public.submit_client_rating(
  p_job uuid, p_punctuality integer, p_clarity integer, p_payment integer
)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  j record;
begin
  select * into j from public.jobs where id = p_job;
  if not found or j.pro_id is distinct from (select auth.uid()) then
    raise exception 'Solo el profesional de este trabajo puede calificar al cliente.';
  end if;
  if j.status <> 'completed' then raise exception 'Solo puedes calificar al cliente al terminar el trabajo.'; end if;
  if p_punctuality not between 1 and 5 or p_clarity not between 1 and 5 or p_payment not between 1 and 5 then
    raise exception 'Elige de 1 a 5 en cada aspecto.';
  end if;
  insert into public.private_client_ratings (job_id, pro_id, client_id, punctuality, clarity, payment, is_low)
  values (p_job, j.pro_id, j.homeowner_id, p_punctuality, p_clarity, p_payment,
          (p_punctuality + p_clarity + p_payment) / 3.0 <= 2);
end;
$function$;

-- 13. Public aggregate for profiles and search cards (published, non-held only). ------
create or replace function public.pro_review_summary(p_pro uuid)
returns table (average numeric, review_count integer)
language sql stable security definer set search_path = ''
as $$
  select round(avg(r.rating)::numeric, 1), count(*)::integer
    from public.reviews r
   where r.pro_id = p_pro
     and r.status = 'published'
     and not public.review_is_held(r.job_id);
$$;

-- 14. Full-refund dispute removes the review; any other outcome leaves it published. --
create or replace function public.sync_reviews_on_dispute_close()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  if new.stage = 'closed' and old.stage is distinct from 'closed' then
    if exists (select 1 from public.refunds r where r.dispute_id = new.id and r.reason = 'dispute_full' and r.status <> 'failed') then
      update public.reviews set status = 'removed',
             status_reason = 'Reembolso total por disputa',
             status_at = now()
       where job_id = new.job_id and status = 'published';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists disputes_sync_reviews on public.disputes;
create trigger disputes_sync_reviews after update of stage on public.disputes
  for each row execute function public.sync_reviews_on_dispute_close();

-- 15. Grants. ------------------------------------------------------------------------
revoke all on function public.review_is_held(uuid) from public, anon;
grant execute on function public.review_is_held(uuid) to authenticated;
revoke all on function public.review_text_has_contact(text) from public;
grant execute on function public.review_text_has_contact(text) to authenticated, anon;

revoke all on function public.submit_review(uuid, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.submit_review(uuid, integer, integer, integer, integer, text) to authenticated;
revoke all on function public.edit_review(uuid, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.edit_review(uuid, integer, integer, integer, integer, text) to authenticated;
revoke all on function public.respond_to_review(uuid, text) from public, anon;
grant execute on function public.respond_to_review(uuid, text) to authenticated;
revoke all on function public.flag_review(uuid, text) from public, anon;
grant execute on function public.flag_review(uuid, text) to authenticated;
revoke all on function public.moderate_review(uuid, text, text) from public, anon;
grant execute on function public.moderate_review(uuid, text, text) to authenticated;
revoke all on function public.submit_client_rating(uuid, integer, integer, integer) from public, anon;
grant execute on function public.submit_client_rating(uuid, integer, integer, integer) to authenticated;
revoke all on function public.pro_review_summary(uuid) from public;
grant execute on function public.pro_review_summary(uuid) to anon, authenticated;

-- 16. Public review list with the display name (D5-a). ------------------------------
-- profiles stays own-row/admin only. This function returns the derived name, never the full name.
create or replace function public.review_display_name(p_full_name text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when p_full_name is null or btrim(p_full_name) = '' then 'Cliente'
    when array_length(regexp_split_to_array(btrim(p_full_name), '\s+'), 1) = 1
      then btrim(p_full_name)
    else split_part(btrim(p_full_name), ' ', 1) || ' '
      || left((regexp_split_to_array(btrim(p_full_name), '\s+'))[array_length(regexp_split_to_array(btrim(p_full_name), '\s+'), 1)], 1) || '.'
  end;
$$;

create or replace function public.list_pro_reviews(p_pro uuid)
returns table (
  id uuid, job_id uuid, rating integer, quality integer, punctuality integer, cleanliness integer,
  comment text, created_at timestamptz, updated_at timestamptz, reviewer_name text,
  response_id uuid, response_body text, response_edited boolean
)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.job_id, r.rating::integer, r.quality::integer, r.punctuality::integer, r.cleanliness::integer,
         r.comment, r.created_at, r.updated_at,
         public.review_display_name(p.full_name),
         rr.id, rr.body, rr.edited
    from public.reviews r
    left join public.profiles p on p.id = r.reviewer_id
    left join public.review_responses rr on rr.review_id = r.id
   where r.pro_id = p_pro
     and r.status = 'published'
     and not public.review_is_held(r.job_id)
   order by r.created_at desc
   limit 100;
$$;

revoke all on function public.review_display_name(text) from public;
grant execute on function public.review_display_name(text) to anon, authenticated;
revoke all on function public.list_pro_reviews(uuid) from public;
grant execute on function public.list_pro_reviews(uuid) to anon, authenticated;
