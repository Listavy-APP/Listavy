-- Sprint 3 complete: payment_status = 'paid' is now set only by apply_stripe_checkout
-- (called from the stripe-webhook function). Remove the test stub from migration 0011.
drop function if exists public.test_mark_job_paid(uuid);
