-- Job Intelligence v3 — persisted job filters + supporting indexes.
create table if not exists saved_job_filters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists saved_job_filters_org_idx on saved_job_filters (organization_id, rep_id);

alter table saved_job_filters enable row level security;
drop policy if exists saved_job_filters_select on saved_job_filters;
create policy saved_job_filters_select on saved_job_filters for select to authenticated, service_role
  using (organization_id = current_org_id());
drop policy if exists saved_job_filters_insert on saved_job_filters;
create policy saved_job_filters_insert on saved_job_filters for insert to authenticated, service_role
  with check (organization_id = current_org_id());
drop policy if exists saved_job_filters_update on saved_job_filters;
create policy saved_job_filters_update on saved_job_filters for update to authenticated, service_role
  using (organization_id = current_org_id()) with check (organization_id = current_org_id());
drop policy if exists saved_job_filters_delete on saved_job_filters;
create policy saved_job_filters_delete on saved_job_filters for delete to authenticated, service_role
  using (organization_id = current_org_id());

create index if not exists jobs_remote_posted_idx on jobs (remote, posted_at desc);
create index if not exists jobs_salary_idx on jobs (salary_min desc nulls last, salary_max desc nulls last);
create index if not exists jobs_employment_idx on jobs (employment_type);
create index if not exists jobs_seniority_idx on jobs (seniority);
