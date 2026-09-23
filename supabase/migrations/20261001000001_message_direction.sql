-- 20261001000001: Track inbound vs outbound on messages
--
-- Previously every messages row implicitly represented an outbound rep action.
-- A rep can paste a prospect's reply into the workspace, but the prospect's
-- incoming text was never persisted as its own message row (only the rep's
-- reply was). This column lets us record an inbound message — the prospect's
-- actual words — as a first-class row.
--
-- Purely additive: one column with a safe 'outbound' default so every legacy
-- row remains valid and behaves exactly as before.

alter table messages add column if not exists direction text not null default 'outbound';

alter table messages drop constraint if exists messages_direction_check;
alter table messages add constraint messages_direction_check
  check (direction in ('outbound', 'inbound'));

create index if not exists messages_direction_idx
  on messages(organization_id, lead_id, direction);

comment on column messages.direction is
  'outbound = a rep sent this; inbound = the prospect replied. Legacy rows default to outbound.';
