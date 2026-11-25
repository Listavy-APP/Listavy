-- 0123: adds the 'diploma' stage to pro_verifications.stage.
-- Optional supporting document for individuals ("Diploma o certificado"). No issue or expiry date.
-- Approval uses the generic path in admin_review_verification (0121): expires_at stays null.
-- NOT APPLIED. Sam applies on Fabian's go.

alter table public.pro_verifications drop constraint pro_verifications_stage_check;

alter table public.pro_verifications add constraint pro_verifications_stage_check check (stage in (
  'identity', 'selfie', 'buena_conducta', 'sie_licence', 'infotep_certificate', 'diploma', 'insurance',
  'company_entity', 'company_registry', 'representative'));
