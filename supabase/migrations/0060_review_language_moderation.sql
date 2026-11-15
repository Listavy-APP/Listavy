-- 0060 Review language moderation (Build 5, APPROVED defaults).
-- Clear Spanish profanity/slurs in a review or a pro reply hold the text (status = 'hidden')
-- and record flag_reasons = ['lenguaje'] until an admin publishes it. Conservative list, v1.
-- Not applied. Requires Fabian approval before apply.

-- 1. Columns. -------------------------------------------------------------------------
alter table public.reviews
  add column if not exists flag_reasons text[] not null default '{}';

alter table public.review_responses
  add column if not exists status       text not null default 'published'
    check (status in ('published', 'hidden')),
  add column if not exists flag_reasons text[] not null default '{}';

-- 2. Word check. Accents folded, whole words only. Word list lives here (v1). ---------
create or replace function public.review_text_has_profanity(p_text text)
returns boolean
language sql immutable
set search_path = ''
as $$
  -- ñ is NOT folded: 'coño' must not collide with 'cono' (cone).
  select lower(translate(coalesce(p_text, ''), 'áéíóúüÁÉÍÓÚÜ', 'aeiouuaeiouu'))
         ~ '\m(mierda|mierdas|puta|putas|puto|putos|pendejo|pendeja|pendejos|pendejas|cabron|cabrones|coño|coñazo|coñaso|mmg|carajo|hijueputa|hijoeputa|joder|maricon|maricones|mariconazo|mariconaso|marica|maricas|mamon|mamona|gonorrea|culero|culera)\M';
$$;

-- 3. Submit review: hold on language hit. ---------------------------------------------
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
  v_flag boolean;
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

  v_flag := v_comment is not null and public.review_text_has_profanity(v_comment);

  insert into public.reviews (job_id, reviewer_id, pro_id, rating, quality, punctuality, cleanliness, comment,
                              status, status_reason, status_at, flag_reasons)
  values (p_job, (select auth.uid()), j.pro_id, p_rating, p_quality, p_punctuality, p_cleanliness, v_comment,
          case when v_flag then 'hidden' else 'published' end,
          case when v_flag then 'Revisión automática: lenguaje' end,
          case when v_flag then now() end,
          case when v_flag then array['lenguaje']::text[] else '{}'::text[] end)
  returning id into v_id;
  return v_id;
end;
$function$;

-- 4. Edit review: re-check language on every edit. ------------------------------------
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
  v_flag boolean;
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

  v_flag := v_comment is not null and public.review_text_has_profanity(v_comment);

  update public.reviews set
    rating = p_rating, quality = p_quality, punctuality = p_punctuality,
    cleanliness = p_cleanliness, comment = v_comment, updated_at = now(),
    status = case when v_flag then 'hidden'
                  when r.status = 'hidden' and r.flag_reasons @> array['lenguaje'] then 'hidden'
                  else r.status end,
    status_reason = case when v_flag then 'Revisión automática: lenguaje' else r.status_reason end,
    status_at = case when v_flag and r.status <> 'hidden' then now() else r.status_at end,
    flag_reasons = case when v_flag then array['lenguaje']::text[] else r.flag_reasons end
  where id = p_review;
end;
$function$;

-- 5. Pro reply: hold on language hit. -------------------------------------------------
create or replace function public.respond_to_review(p_review uuid, p_body text)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  r record;
  v_body text := btrim(coalesce(p_body, ''));
  v_flag boolean;
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

  v_flag := public.review_text_has_profanity(v_body);

  select * into existing from public.review_responses where review_id = p_review;
  if not found then
    insert into public.review_responses (review_id, pro_id, body, status, flag_reasons)
    values (p_review, r.pro_id, v_body,
            case when v_flag then 'hidden' else 'published' end,
            case when v_flag then array['lenguaje']::text[] else '{}'::text[] end);
  elsif existing.edited then
    raise exception 'Ya editaste tu respuesta. Solo se permite una edición.';
  else
    update public.review_responses set body = v_body, edited = true, updated_at = now(),
           status = case when v_flag then 'hidden' else 'published' end,
           flag_reasons = case when v_flag then array['lenguaje']::text[] else '{}'::text[] end
     where review_id = p_review;
  end if;
end;
$function$;

-- 6. Public read of replies: published replies only. ----------------------------------
drop policy if exists review_responses_select on public.review_responses;
create policy review_responses_select on public.review_responses for select
  using (
    public.is_admin()
    or pro_id = (select auth.uid())
    or (
      review_responses.status = 'published'
      and exists (select 1 from public.reviews r where r.id = review_responses.review_id
                  and r.status = 'published' and not public.review_is_held(r.job_id))
    )
  );

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
    left join public.review_responses rr on rr.review_id = r.id and rr.status = 'published'
   where r.pro_id = p_pro
     and r.status = 'published'
     and not public.review_is_held(r.job_id)
   order by r.created_at desc
   limit 100;
$$;

-- 7. Admin: publish or hide a pro reply. ----------------------------------------------
create or replace function public.moderate_review_response(p_review uuid, p_action text)
returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede moderar respuestas.'; end if;
  if p_action not in ('publish', 'hide') then raise exception 'Acción no válida.'; end if;
  update public.review_responses set
    status = case p_action when 'publish' then 'published' else 'hidden' end,
    flag_reasons = case when p_action = 'publish' then '{}'::text[] else flag_reasons end,
    updated_at = now()
   where review_id = p_review;
  if not found then raise exception 'La respuesta no existe.'; end if;
end;
$function$;

-- 8. Admin publish of a review clears its language flag. ------------------------------
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
    flag_reasons = case when p_action = 'publish' then '{}'::text[] else flag_reasons end,
    status_at = now()
  where id = p_review;
  if not found then raise exception 'La reseña no existe.'; end if;
end;
$function$;

-- 9. One-time scan of existing reviews and replies. Matches go to hold. ----------------
update public.reviews set
  status = 'hidden',
  status_reason = 'Revisión automática: lenguaje',
  status_at = now(),
  flag_reasons = array['lenguaje']::text[]
where status = 'published'
  and comment is not null
  and public.review_text_has_profanity(comment);

update public.review_responses set
  status = 'hidden',
  flag_reasons = array['lenguaje']::text[],
  updated_at = now()
where status = 'published'
  and public.review_text_has_profanity(body);
