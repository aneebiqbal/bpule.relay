-- 0032: Per-host call logging for the AI tier chain.
--
-- extraction_runs logs success/failure per call but not which specific host
-- served it or why a host failed before falling through. host_calls records
-- every individual host attempt — success or failure — with a categorized
-- failure reason, so "how often is DeepSeek failing on insufficient balance"
-- becomes a queryable question instead of a manual grep of server logs.

create table if not exists host_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task text not null default 'extract' check (task in ('extract', 'draft', 'calibrate', 'refine')),
  host text not null,
  model text not null default '',
  cost_tier text check (cost_tier in ('tier1', 'tier2', 'tier3', 'tier4')),
  success boolean not null,
  failure_reason text check (failure_reason in ('rate_limit', 'insufficient_balance', 'timeout', 'auth', 'other')),
  error_message text not null default '',
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists host_calls_org_idx on host_calls (organization_id, created_at desc);
create index if not exists host_calls_host_idx on host_calls (host, created_at desc);
create index if not exists host_calls_failure_idx on host_calls (failure_reason, created_at desc) where success = false;

alter table host_calls enable row level security;

drop policy if exists host_calls_select on host_calls;
create policy host_calls_select on host_calls for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists host_calls_insert on host_calls;
create policy host_calls_insert on host_calls for insert
  to authenticated with check (organization_id = current_org_id());
