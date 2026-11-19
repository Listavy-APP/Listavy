-- 0088 · Verify Email Early: one-time email prompt stamp.
-- NOT APPLIED. Sam reviews first; Fabian approves the apply.
--
-- Set when the owner dismisses the post-login "Agrega tu correo" step, or verifies from it.
-- The step appears only while profiles.email is null AND this column is null.
--
-- No policy or guard change is needed:
--   * profiles_update_own (0001) already limits updates to the caller's own row.
--   * guard_profile_privileges (0040) checks role, phone, email, email_verified_at,
--     avatar_path and the referral columns. It does not check this column.

alter table public.profiles
  add column if not exists email_prompt_dismissed_at timestamptz null;

comment on column public.profiles.email_prompt_dismissed_at is
  'Set once the owner dismisses or completes the post-login email prompt. Owner-writable via profiles_update_own.';
