-- 0084: adds the 'selfie' stage to pro_verifications.stage.
-- Identity is now two uploads: 'identity' (cédula photo) and 'selfie'.
-- NOT APPLIED. Sam reviews, then Fabian approves before this runs in production.
-- Constraint name is Postgres's default for the inline check in 0074.

alter table public.pro_verifications drop constraint pro_verifications_stage_check;

alter table public.pro_verifications add constraint pro_verifications_stage_check check (stage in (
  'identity', 'selfie', 'buena_conducta', 'sie_licence', 'infotep_certificate', 'insurance',
  'company_entity', 'company_registry', 'representative'));
