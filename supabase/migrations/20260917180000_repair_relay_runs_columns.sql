-- Repair: ensure relay_runs has all columns needed by orchestration RPCs.
-- Migration 0086 may have been applied in an older version missing these columns.

alter table relay_runs
  add column if not exists status text not null default 'detected';

alter table relay_runs
  add column if not exists current_step text not null default 'detect';

alter table relay_runs
  add column if not exists revenue_identity_id uuid references revenue_identities(id) on delete set null;

alter table relay_runs
  add column if not exists correlation_id uuid not null default gen_random_uuid();

alter table relay_runs
  add column if not exists waiting_until timestamptz;

alter table relay_runs
  add column if not exists completed_at timestamptz;

alter table relay_runs
  add column if not exists failed_at timestamptz;

alter table relay_runs
  add column if not exists failure_category text;

alter table relay_runs
  add column if not exists failure_reason text;

alter table relay_runs
  add column if not exists context jsonb not null default '{}'::jsonb;

alter table relay_runs
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists rr_org_status_idx on relay_runs (organization_id, status);
create index if not exists rr_active_idx on relay_runs (organization_id, status) where status not in ('completed', 'failed', 'cancelled', 'rejected');
create index if not exists rr_entity_idx on relay_runs (primary_entity_type, primary_entity_id) where primary_entity_id is not null;
create index if not exists rr_rep_idx on relay_runs (assigned_rep_id) where assigned_rep_id is not null;
create index if not exists rr_correlation_idx on relay_runs (correlation_id);
