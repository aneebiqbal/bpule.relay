-- 20261001000002: Lead archival (soft-delete, never a hard delete)
--
-- Product problem: the leads board shows every lead forever, regardless of
-- age or terminal status. Approved design: leads that have used all 3
-- allowed follow-ups (see the follow-up cap raise 1 -> 3, followup-engine.ts)
-- and have gone quiet for 3+ calendar days with no reply are archived off
-- the default board — but never deleted, and always findable again via the
-- archive/search page (archive_search has no opinion on this new column, so
-- it already surfaces archived leads once they exist).
--
-- Purely additive: two columns with safe defaults, so every legacy row
-- remains valid (archived = false) and behaves exactly as before until the
-- sweep cron actually archives something.

alter table leads add column if not exists archived boolean not null default false;
alter table leads add column if not exists archived_at timestamptz;

-- Partial index: most queries filter archived = false (the default "active
-- leads" read path), so only index that half of the table.
create index if not exists leads_archived_idx
  on leads(organization_id, archived)
  where archived = false;

comment on column leads.archived is
  'Soft-archive flag. true = hidden from the default leads board, but still findable via /archive search. Never a hard delete.';
comment on column leads.archived_at is
  'When this lead was archived. Cleared (set back to null) automatically on auto-restore-on-reply.';
