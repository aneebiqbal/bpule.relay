-- Versioned, job-independent master resume per profile.
create table if not exists master_resumes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  version integer not null default 1,
  content jsonb not null,
  source_hash text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, profile_id, version)
);
create index if not exists master_resumes_profile_idx on master_resumes (organization_id, profile_id, version desc);

alter table master_resumes enable row level security;
drop policy if exists master_resumes_select on master_resumes;
create policy master_resumes_select on master_resumes for select to authenticated, service_role
  using (true);

-- Bounded automatic application-preparation packages.
create table if not exists prepared_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  documents jsonb not null,
  assessment jsonb,
  match_score integer,
  match_category text,
  status text not null default 'ready',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, job_id, profile_id)
);
create index if not exists prepared_jobs_org_idx on prepared_jobs (organization_id, created_at desc);
create unique index if not exists prepared_jobs_idempotency_idx on prepared_jobs (idempotency_key);

alter table prepared_jobs enable row level security;
drop policy if exists prepared_jobs_select on prepared_jobs;
create policy prepared_jobs_select on prepared_jobs for select to authenticated, service_role
  using (true);
