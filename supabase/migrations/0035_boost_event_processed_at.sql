-- 0035: apply_boost_checkout sets stripe_events.processed_at on every path, as the job path does.
-- Applied to the project after 0034. Body matches the applied function; only the processed_at updates are new.
(full function body applied via apply_migration 0035_boost_event_processed_at; see 0033 for the base definition)
