-- Manual Jobs synchronization requests.
--
-- The Jobs "Sync Now" action must never crawl inside a Next.js request. It
-- enqueues one durable run here; the scheduled discovery worker executes it on
-- its next tick. One active request per organization makes repeated clicks
-- idempotent, and the application enforces a completion cooldown on top.
--
-- Additive only. No existing table or row is modified.

create table if not exists job_sync_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  requested_by uuid references reps(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'rejected')),
  source_ids jsonb not null default '[]'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- One active crawl per organization: a second click returns the first request.
create unique index if not exists jsr_one_active_org_idx
  on job_sync_requests (organization_id)
  where status in ('queued', 'running');

create index if not exists jsr_org_created_idx
  on job_sync_requests (organization_id, created_at desc);

alter table job_sync_requests enable row level security;

drop policy if exists "jsr_select" on job_sync_requests;
create policy "jsr_select" on job_sync_requests
  for select to authenticated using (organization_id = current_org_id());

drop policy if exists "jsr_insert" on job_sync_requests;
create policy "jsr_insert" on job_sync_requests
  for insert to authenticated with check (organization_id = current_org_id() and is_org_admin());

-- Workers use the service role and update rows directly; no client may mutate
-- a request's status or result.

comment on table job_sync_requests is
  'Durable manual Jobs sync requests. The request route only enqueues; the discovery worker executes. One active request per organization plus an application-level completion cooldown.';
