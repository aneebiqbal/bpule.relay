-- 0015: Rich extraction persistence + extraction reliability metrics.

alter table leads
  add column if not exists title_raw text,
  add column if not exists location_raw text,
  add column if not exists role_category text check (role_category in ('founder_cofounder', 'ceo', 'technical_leadership', 'product', 'hiring_manager_recruiter', 'other')),
  add column if not exists market_region text,
  add column if not exists extraction_confidence int check (extraction_confidence between 0 and 100),
  add column if not exists extraction_profile jsonb;

alter table leads drop constraint if exists leads_score_check;
alter table leads add constraint leads_score_check check (score between -2 and 14);

create table if not exists extraction_runs (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references reps(id),
  success boolean not null,
  latency_ms int not null check (latency_ms >= 0),
  model text not null,
  error_message text,
  created_at timestamptz default now()
);

create index if not exists extraction_runs_created_idx on extraction_runs (created_at desc);
create index if not exists extraction_runs_rep_idx on extraction_runs (rep_id, created_at desc);

alter table extraction_runs enable row level security;

drop policy if exists extraction_runs_select on extraction_runs;
create policy extraction_runs_select on extraction_runs for select
  to authenticated using (auth.role() = 'authenticated');

drop policy if exists extraction_runs_insert on extraction_runs;
create policy extraction_runs_insert on extraction_runs for insert
  to authenticated with check (rep_id = public.current_rep_id() or public.is_admin());
