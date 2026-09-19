-- Revenue loop: persist conversation commercial state and human send feedback.
-- Forward-only. Existing tables remain authoritative.

alter table conversation_states
  add column if not exists commercial_state jsonb not null default '{}'::jsonb;

alter table edit_learning
  add column if not exists send_disposition text,
  add column if not exists reject_reasons text[] not null default '{}';

alter table messages
  add column if not exists original_draft text,
  add column if not exists send_disposition text,
  add column if not exists reject_reasons text[] not null default '{}';

comment on column conversation_states.commercial_state is
  'First-party commercial knowledge extracted from replies. Known/unknown fields only.';
comment on column edit_learning.send_disposition is
  'SENT_UNCHANGED | LIGHT_EDIT | HEAVY_EDIT | REJECTED. Do not auto-retrain from tiny samples.';
