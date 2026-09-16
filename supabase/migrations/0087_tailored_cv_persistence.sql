-- 0087: Tailored CV persistence
--
-- Stores job-specific CV artifacts so a job application preserves exactly what
-- was used: Job → Revenue Identity → Base CV → Tailored CV → ATS → Proposal → Applied.
-- Without this, a client reply later cannot be traced to the actual CV sent.

create table if not exists tailored_cvs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references upwork_jobs(id) on delete cascade,
  revenue_identity_id uuid references revenue_identities(id) on delete set null,
  profile_id uuid references profiles(id) on delete set null,

  -- Source truth references
  base_cv_path text,
  base_resume_snapshot jsonb not null default '{}'::jsonb,

  -- Tailored output
  tailored_resume jsonb not null default '{}'::jsonb,
  tailored_cv_path text,

  -- ATS analysis
  ats_score integer not null default 0 check (ats_score between 0 and 100),
  ats_dimensions jsonb not null default '[]'::jsonb,
  ats_missing_skills text[] not null default '{}',

  -- Target context at generation time
  target_title text,
  target_skills text[] not null default '{}',
  target_company text,

  -- Lifecycle
  status text not null default 'generated' check (status in ('generated', 'applied', 'archived')),
  proposal_text text,

  generated_at timestamptz not null default now(),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for common access patterns
create index if not exists idx_tailored_cvs_job_id on tailored_cvs(job_id);
create index if not exists idx_tailored_cvs_org_id on tailored_cvs(organization_id);
create index if not exists idx_tailored_cvs_status on tailored_cvs(status);
create index if not exists idx_tailored_cvs_generated_at on tailored_cvs(generated_at desc);

-- RLS: strict org isolation
alter table tailored_cvs enable row level security;

-- Only members of the owning org can see their org's tailored CVs
create policy "tailured_cvs_org_isolation" on tailored_cvs
  using (organization_id = current_org_id());

-- Insert via app only (authenticated users in their org)
create policy "tailured_cvs_insert" on tailored_cvs
  for insert
  with check (organization_id = current_org_id());

-- Update status (e.g., mark applied) via app only
create policy "tailured_cvs_update" on tailored_cvs
  for update
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- No delete — tailored CVs are historical artifacts
-- (soft-delete via status = 'archived' if needed)

-- Helper: set updated_at automatically
create or replace function set_tailored_cvs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tailored_cvs_updated_at on tailored_cvs;
create trigger trg_tailored_cvs_updated_at
  before update on tailored_cvs
  for each row
  execute function set_tailored_cvs_updated_at();
