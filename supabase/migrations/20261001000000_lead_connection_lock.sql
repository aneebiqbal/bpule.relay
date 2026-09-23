-- 20261001000000: Six-hour connection-pacing lock on leads + status constraint fix
--
-- When a rep sends a connection note on a good-profile lead (verdict 'send'),
-- the lead is locked from further outreach for 6 working hours. This paces
-- the outreach so a rep does not fire a DM the instant a connection note goes
-- out — the prospect needs time to see and accept the connection first.
--
-- At unlock the lead resurfaces as a priority "Send connection message" task,
-- but the existing DM gate (connection_accepted_at must be set) still applies:
-- a DM is only appropriate once the rep has observed the connection accepted.
--
-- Also fixes the leads.status CHECK constraint which was committed without
-- 'won' / 'lost' (the TypeScript LeadStatus type and updateLeadStatus method
-- both support them) — without this fix those statuses fail at the DB level.

-- Lock columns (additive, nullable = unlocked)
alter table leads add column if not exists locked_until timestamptz;
alter table leads add column if not exists locked_reason text;

create index if not exists leads_locked_until_idx
  on leads(organization_id, locked_until)
  where locked_until is not null;

comment on column leads.locked_until is
  'UTC timestamp until which this lead is locked from further outreach. Set when a connection note is sent on a good-profile lead (6h). NULL = unlocked. Server-set; never client-provided.';
comment on column leads.locked_reason is
  'Why the lead was locked. Currently only "connection_note_sent".';

-- Fix status constraint to include won / lost (was missing from 0001)
alter table leads drop constraint if exists leads_status_check;
alter table leads add constraint leads_status_check
  check (status in ('new', 'contacted', 'followed_up', 'replied', 'won', 'lost', 'no', 'dead'));
