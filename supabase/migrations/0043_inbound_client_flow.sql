-- 0043: Inbound client flow — add direction, source, inbound_message to leads
--
-- Adds support for clients who contact us first (inbound) vs us contacting them (outbound).
-- Inbound leads get high-priority queue treatment and use different reply strategies.

alter table leads add column if not exists direction text not null default 'outbound' check (direction in ('inbound', 'outbound'));
alter table leads add column if not exists source text check (source in ('linkedin', 'upwork', 'email', 'referral', 'other'));
alter table leads add column if not exists inbound_message text;
alter table leads add column if not exists inbound_raw jsonb;

create index if not exists leads_direction_idx on leads (organization_id, direction);
create index if not exists leads_source_idx on leads (organization_id, source);
