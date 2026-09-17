-- 0093: Taste signal idempotency
--
-- Adds last_signal_key column to content_taste_profiles to prevent
-- double-learning from duplicate/retried endpoint calls.

alter table content_taste_profiles
  add column if not exists last_signal_key text;

create index if not exists content_taste_profiles_signal_key_idx
  on content_taste_profiles(persona_id, last_signal_key)
  where last_signal_key is not null;
