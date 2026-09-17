-- AI Runtime V3 — Telemetry table
-- Persists AI operation metadata for admin observability.

create table if not exists ai_traces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_class text not null,
  provider text not null,
  model text not null,
  credential_id text not null default 'unknown',
  attempt integer not null default 1,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  input_chars integer not null default 0,
  ttfb_ms integer,
  latency_ms integer not null default 0,
  estimated_cost_usd numeric(12, 8) not null default 0,
  schema_valid boolean not null default true,
  quality text not null default 'UNASSESSED' check (quality in ('GOOD', 'LIGHT_EDIT', 'BAD', 'UNSAFE', 'UNASSESSED')),
  fallback boolean not null default false,
  fallback_reason text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ai_traces_org_created_idx on ai_traces (organization_id, created_at desc);
create index if not exists ai_traces_org_task_idx on ai_traces (organization_id, task_class);
create index if not exists ai_traces_org_provider_idx on ai_traces (organization_id, provider);

alter table ai_traces enable row level security;

drop policy if exists "ai_traces_select" on ai_traces;
create policy "ai_traces_select" on ai_traces for select using (organization_id = current_org_id());

drop policy if exists "ai_traces_insert" on ai_traces;
create policy "ai_traces_insert" on ai_traces for insert with check (organization_id = current_org_id());

comment on table ai_traces is 'AI Runtime V3 telemetry — one row per AI provider attempt. RLS-scoped to organization.';
