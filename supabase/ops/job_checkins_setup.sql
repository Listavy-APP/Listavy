-- Run once in production after migration 0063. Schedules the in-app job check-ins every 15 minutes.
-- Idempotent: unschedules first, so re-running does not create a duplicate.
select cron.unschedule(jobid) from cron.job where jobname = 'job-checkins';
select cron.schedule('job-checkins', '*/15 * * * *', 'select public.run_job_checkins()');
