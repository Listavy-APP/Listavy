-- Run once in production after migration 0096. Schedules the recurring-booking generator daily.
-- 11:00 UTC is 07:00 in America/Santo_Domingo (UTC-4, no DST). Idempotent: unschedules first.
select cron.unschedule(jobid) from cron.job where jobname = 'recurring-bookings';
select cron.schedule('recurring-bookings', '0 11 * * *', 'select public.run_recurring_bookings()');
