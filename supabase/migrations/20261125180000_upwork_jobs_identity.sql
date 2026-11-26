-- The Upwork workspace list selects revenue_identity_id for attribution, but
-- no migration ever created the column. Additive and idempotent; safe on a
-- database where an operator already applied it by hand.

alter table upwork_jobs
  add column if not exists revenue_identity_id uuid references revenue_identities(id) on delete set null;

create index if not exists upwork_jobs_revenue_identity_idx
  on upwork_jobs (revenue_identity_id);

alter table upwork_jobs
  add column if not exists archived_at timestamptz;

comment on column upwork_jobs.revenue_identity_id is
  'Attribution only — the identity whose proposal work produced this job. Never changes ownership.';
