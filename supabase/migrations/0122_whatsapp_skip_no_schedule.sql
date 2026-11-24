-- 0122 · WhatsApp: skip a schedule template when the job has no scheduled date (item 5b, ASAP jobs).
-- Adds one status to notification_log. Send-whatsapp writes skipped_no_schedule for a kind whose
-- variables include the schedule, when the job is ASAP (no scheduled_date). Not a failure.
-- STATUS: NOT APPLIED. Sam reviews and applies it on Fabian's go.

alter table public.notification_log drop constraint if exists notification_log_status_check;
alter table public.notification_log add constraint notification_log_status_check
  check (status in ('sent', 'failed', 'no_subscription', 'skipped_preference', 'skipped_unverified', 'skipped_no_phone', 'skipped_no_schedule'));
