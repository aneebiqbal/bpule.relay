-- B12: persist full sender context on messages.
--
-- `sender_profile_id` existed but was never written (NULL on every row), so the
-- identity that generated/sent a message could not be audited. This adds the
-- revenue identity and an explicit attribution status.
--
-- Backfill rule (never guess): a row is KNOWN only when the sender profile was
-- already captured. Rows with no captured sender stay UNKNOWN; no historical
-- identity is inferred.

alter table messages add column if not exists revenue_identity_id uuid;
alter table messages add column if not exists sender_attribution_status text not null default 'UNKNOWN';

create index if not exists messages_revenue_identity_idx on messages (revenue_identity_id);

update messages set sender_attribution_status = 'KNOWN' where sender_profile_id is not null;

comment on column messages.revenue_identity_id is 'Revenue identity (workspace profile) that owns the sender side of this message.';
comment on column messages.sender_attribution_status is 'KNOWN when the sender was captured, UNKNOWN when it was not. Never INFERRED: identity is never guessed.';
