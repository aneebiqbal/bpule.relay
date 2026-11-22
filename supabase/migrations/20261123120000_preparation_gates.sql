-- Preparation attempts (including skips and failures) and package reason.
create table if not exists preparation_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  idempotency_key text not null,
  status text not null,          -- ready, needs_review, needs_evidence, failed, skipped
  reason text not null,
  match_score integer,
  created_at timestamptz not null default now()
);
create index if not exists preparation_logs_org_idx on preparation_logs (organization_id, created_at desc);
create index if not exists preparation_logs_job_idx on preparation_logs (job_id, profile_id);

alter table prepared_jobs add column if not exists reason text;
