-- Listavy: convert the TEST pro into the launch demo profile.
-- Pro: 00000000-0000-4000-8000-000000000001. Depends on 0058.
-- Removes only the TEST review and its reply (no financial link). The job, dispute, payment, refund,
-- guarantee-reserve row, and Stripe records are NOT changed.

-- 1. Set the demo flag and take the pro off availability. The trigger from 0058 requires an admin;
--    this migration runs as the migration owner, so the guard is checked here.
alter table public.pros disable trigger pros_is_demo_guard;
update public.pros
   set is_demo = true,
       available = false
 where id = '00000000-0000-4000-8000-000000000001';
alter table public.pros enable trigger pros_is_demo_guard;

-- 2. Demo name shown on the profile and cards.
update public.profiles
   set full_name = 'Plomería Demo'
 where id = '00000000-0000-4000-8000-000000000001';

-- 3. Remove the TEST review and its reply (review_responses cascades from reviews by review_id).
delete from public.reviews
 where id = 'f89efb4d-1c2b-4373-adcc-ebab889e19dd';

-- 4. Five illustrative demo reviews. Each one is labelled as a demonstration in the UI.
insert into public.demo_reviews (pro_id, rating, quality, punctuality, cleanliness, comment) values
  ('00000000-0000-4000-8000-000000000001', 5, 5, 5, 5, 'Demostración: llegó puntual, diagnosticó la fuga en minutos y dejó todo limpio.'),
  ('00000000-0000-4000-8000-000000000001', 5, 5, 5, 5, 'Demostración: explicó el precio antes de empezar y no hubo cargos extra.'),
  ('00000000-0000-4000-8000-000000000001', 4, 4, 5, 4, 'Demostración: trabajo ordenado y bien explicado. Cumplió el plazo acordado.'),
  ('00000000-0000-4000-8000-000000000001', 5, 5, 5, 5, 'Demostración: respondió rápido por WhatsApp y resolvió el problema el mismo día.'),
  ('00000000-0000-4000-8000-000000000001', 5, 5, 4, 5, 'Demostración: instaló la llave nueva sin dañar la pared. Lo recomiendo.');
