-- ============================================================================
-- Job Intelligence v2 — canonical discovery storage, verification, matching,
-- saved opportunities, application documents and outcomes.
--
-- Additive only. Existing upwork_jobs / upwork_applications remain the Upwork
-- workflow of record; the canonical `jobs` table is the discovery source of
-- truth and the Jobs workspace unions both at read time.
--
-- RLS: job listings are public data (select for any authenticated role).
-- Everything user-specific is organization-scoped by current_org_id().
-- The ingestion worker uses the service role; it never reads a rep session.
-- ============================================================================

-- ── Sources ─────────────────────────────────────────────────────────────────
create table if not exists job_sources (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('ats', 'feed', 'rss', 'manual')),
  base_url text,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  interval_secs integer not null default 3600 check (interval_secs >= 60),
  daily_cap integer check (daily_cap is null or daily_cap > 0),
  cursor text,
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Ingestion runs ──────────────────────────────────────────────────────────
create table if not exists ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references job_sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'ok', 'partial', 'failed')),
  jobs_found integer not null default 0,
  jobs_inserted integer not null default 0,
  jobs_updated integer not null default 0,
  jobs_expired integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists ingestion_runs_source_time_idx
  on ingestion_runs (source_id, started_at desc);

-- ── Canonical jobs ──────────────────────────────────────────────────────────
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references job_sources(id) on delete cascade,
  source_job_id text not null,
  title text not null,
  company text,
  company_logo text,
  location_raw text,
  country text,
  remote boolean not null default false,
  hybrid boolean not null default false,
  onsite boolean not null default false,
  employment_type text,
  seniority text,
  salary_min numeric,
  salary_max numeric,
  salary_currency char(3),
  salary_period text,
  salary_raw text,
  description text,
  excerpt text,
  skills text[] not null default '{}',
  categories text[] not null default '{}',
  posted_at timestamptz,
  expires_at timestamptz,
  apply_url text,
  source_url text,
  attribution jsonb,
  raw jsonb,
  eligibility jsonb,
  verification_status text not null default 'verification_needed'
    check (verification_status in (
      'verified_open', 'recently_seen', 'verification_needed',
      'closed', 'expired', 'source_unavailable'
    )),
  verification_evidence jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_verified_at timestamptz,
  closed_at timestamptz,
  content_hash text,
  dedupe_key text,
  duplicate_group_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, source_job_id)
);
create index if not exists jobs_source_time_idx on jobs (source_id, last_seen_at desc);
create index if not exists jobs_posted_idx on jobs (posted_at desc);
create index if not exists jobs_company_idx on jobs (company);
create index if not exists jobs_verification_idx on jobs (verification_status);
create index if not exists jobs_skills_idx on jobs using gin (skills);
create index if not exists jobs_duplicate_group_idx on jobs (duplicate_group_id);
create index if not exists jobs_dedupe_key_idx on jobs (dedupe_key);

-- Run-level source snapshots: what was fetched, when, and the validators the
-- source gave us. Per-job raw payloads stay on jobs.raw.
create table if not exists source_snapshots (
  id uuid primary key default gen_random_uuid(),
  ingestion_run_id uuid references ingestion_runs(id) on delete cascade,
  source_id text not null references job_sources(id) on delete cascade,
  url text not null,
  http_status integer,
  etag text,
  last_modified text,
  content_hash text,
  captured_at timestamptz not null default now()
);
create index if not exists source_snapshots_source_time_idx
  on source_snapshots (source_id, captured_at desc);

create table if not exists job_duplicate_groups (
  id uuid primary key default gen_random_uuid(),
  canonical_job_id uuid references jobs(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── Profile ↔ job matches ───────────────────────────────────────────────────
create table if not exists job_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  category text not null check (category in (
    'excellent', 'strong', 'possible', 'stretch', 'not_eligible', 'requires_verification'
  )),
  breakdown jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  explanation text,
  score_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, job_id, profile_id)
);
create index if not exists job_matches_org_profile_idx
  on job_matches (organization_id, profile_id, score desc);
create index if not exists job_matches_job_idx on job_matches (job_id);

-- ── Saved opportunities ─────────────────────────────────────────────────────
create table if not exists saved_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  rep_id uuid references reps(id) on delete set null,
  status text not null default 'saved'
    check (status in ('saved', 'reviewed', 'prepared', 'applied', 'rejected', 'withdrawn', 'archived')),
  notes text not null default '',
  reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, job_id, profile_id)
);
create index if not exists saved_jobs_org_recent_idx
  on saved_jobs (organization_id, updated_at desc);

-- ── Application documents ───────────────────────────────────────────────────
create table if not exists application_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('cv', 'cover_letter', 'upwork_proposal', 'linkedin_note', 'portfolio')),
  version integer not null default 1,
  content jsonb not null default '{}'::jsonb,
  text text,
  storage_path text,
  ats jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, job_id, profile_id, kind, version)
);
create index if not exists application_documents_lookup_idx
  on application_documents (organization_id, job_id, profile_id, kind);

-- ── Applications and outcomes ───────────────────────────────────────────────
create table if not EXISTS applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  rep_id uuid references reps(id) on delete set null,
  account_id uuid,
  status text not null default 'draft'
    check (status in (
      'draft', 'saved', 'reviewed', 'prepared', 'applied', 'replied',
      'interview', 'offer', 'hired', 'rejected', 'withdrawn'
    )),
  method text not null default 'manual'
    check (method in ('manual', 'external', 'upwork', 'linkedin', 'email')),
  destination_url text,
  submitted_at timestamptz,
  notes text not null default '',
  reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, job_id, profile_id)
);
create index if not exists applications_org_status_idx
  on applications (organization_id, status, updated_at desc);

create table if not exists application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references reps(id) on delete set null,
  note text not null default '',
  occurred_at timestamptz not null default now()
);
create index if not exists application_events_app_idx
  on application_events (application_id, occurred_at);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table job_sources enable row level security;
alter table ingestion_runs enable row level security;
alter table jobs enable row level security;
alter table job_duplicate_groups enable row level security;
alter table job_matches enable row level security;
alter table saved_jobs enable row level security;
alter table application_documents enable row level security;
alter table applications enable row level security;
alter table application_events enable row level security;

-- Public job data: readable by any authenticated role, writable by the service
-- role only. Anon has no grant (20261106150000) and no policy.
drop policy if exists jobs_select on jobs;
create policy jobs_select on jobs for select to authenticated, service_role using (true);
drop policy if exists job_sources_select on job_sources;
create policy job_sources_select on job_sources for select to authenticated, service_role using (true);
drop policy if exists ingestion_runs_select on ingestion_runs;
create policy ingestion_runs_select on ingestion_runs for select to authenticated, service_role using (true);
drop policy if exists job_duplicate_groups_select on job_duplicate_groups;
create policy job_duplicate_groups_select on job_duplicate_groups for select to authenticated, service_role using (true);

-- User-specific tables: organization-scoped.
drop policy if exists job_matches_select on job_matches;
create policy job_matches_select on job_matches for select to authenticated, service_role
  using (organization_id = current_org_id());
drop policy if exists job_matches_insert on job_matches;
create policy job_matches_insert on job_matches for insert to authenticated, service_role
  with check (organization_id = current_org_id());
drop policy if exists job_matches_update on job_matches;
create policy job_matches_update on job_matches for update to authenticated, service_role
  using (organization_id = current_org_id()) with check (organization_id = current_org_id());

drop policy if exists saved_jobs_select on saved_jobs;
create policy saved_jobs_select on saved_jobs for select to authenticated, service_role
  using (organization_id = current_org_id());
drop policy if exists saved_jobs_insert on saved_jobs;
create policy saved_jobs_insert on saved_jobs for insert to authenticated, service_role
  with check (organization_id = current_org_id());
drop policy if exists saved_jobs_update on saved_jobs;
create policy saved_jobs_update on saved_jobs for update to authenticated, service_role
  using (organization_id = current_org_id()) with check (organization_id = current_org_id());
drop policy if exists saved_jobs_delete on saved_jobs;
create policy saved_jobs_delete on saved_jobs for delete to authenticated, service_role
  using (organization_id = current_org_id());

drop policy if exists application_documents_select on application_documents;
create policy application_documents_select on application_documents for select to authenticated, service_role
  using (organization_id = current_org_id());
drop policy if exists application_documents_insert on application_documents;
create policy application_documents_insert on application_documents for insert to authenticated, service_role
  with check (organization_id = current_org_id());
drop policy if exists application_documents_update on application_documents;
create policy application_documents_update on application_documents for update to authenticated, service_role
  using (organization_id = current_org_id()) with check (organization_id = current_org_id());
drop policy if exists application_documents_delete on application_documents;
create policy application_documents_delete on application_documents for delete to authenticated, service_role
  using (organization_id = current_org_id());

drop policy if exists applications_select on applications;
create policy applications_select on applications for select to authenticated, service_role
  using (organization_id = current_org_id());
drop policy if exists applications_insert on applications;
create policy applications_insert on applications for insert to authenticated, service_role
  with check (organization_id = current_org_id());
drop policy if exists applications_update on applications;
create policy applications_update on applications for update to authenticated, service_role
  using (organization_id = current_org_id()) with check (organization_id = current_org_id());
drop policy if exists applications_delete on applications;
create policy applications_delete on applications for delete to authenticated, service_role
  using (organization_id = current_org_id());

drop policy if exists application_events_select on application_events;
create policy application_events_select on application_events for select to authenticated, service_role
  using (organization_id = current_org_id());
drop policy if exists application_events_insert on application_events;
create policy application_events_insert on application_events for insert to authenticated, service_role
  with check (organization_id = current_org_id());

drop policy if exists source_snapshots_select on source_snapshots;
create policy source_snapshots_select on source_snapshots for select to authenticated, service_role
  using (true);

-- One worker instance at a time. The lock expires so a crashed run cannot
-- block the next timer tick forever.
create table if not exists job_discovery_locks (
  lock_key text primary key,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- ── Seed sources ────────────────────────────────────────────────────────────
-- Remote boards are enabled by default. ATS boards stay disabled until an
-- operator supplies a real slug/company: an empty slug would only produce 404
-- noise and rate-limit pressure.
insert into job_sources (id, name, kind, base_url, config, enabled, interval_secs) values
  ('remoteok', 'RemoteOK', 'feed', 'https://remoteok.com/api', '{}'::jsonb, true, 3600),
  ('remotive', 'Remotive', 'feed', 'https://remotive.com/api/remote-jobs', '{"limit":100}'::jsonb, true, 3600),
  ('greenhouse', 'Greenhouse', 'ats', 'https://boards-api.greenhouse.io/v1/boards', '{"slug":""}'::jsonb, false, 86400),
  ('lever', 'Lever', 'ats', 'https://api.lever.co/v0/postings', '{"slug":""}'::jsonb, false, 86400),
  ('ashby', 'Ashby', 'ats', 'https://api.ashbyhq.com/posting-api/job-board', '{"slug":""}'::jsonb, false, 86400),
  ('smartrecruiters', 'SmartRecruiters', 'ats', 'https://api.smartrecruiters.com/v1/companies', '{"company":""}'::jsonb, false, 86400),
  ('manual', 'Manual import', 'manual', null, '{}'::jsonb, false, 86400)
on conflict (id) do nothing;
