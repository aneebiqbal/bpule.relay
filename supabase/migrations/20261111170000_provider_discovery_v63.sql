-- RELAY V6.3 — Lead enrichment + daily discovery.
--
-- Providers (Prospeo primary, Snov fallback, Apollo disabled) feed the EXISTING
-- prospect pipeline. Nothing here introduces a second lead, profile, target,
-- conversation, scheduler or action authority:
--
--   candidates  -> captured_prospects (the one staging authority)
--   leads       -> createLead() / leads
--   scoring     -> canonical_score + qualifyCanonicalScore()
--   profile fit -> rankSendersForLead()
--   contacts    -> contact_points (one verification status)
--   email       -> sendPreparedEmail() / prepareEmailDraft()
--   follow-up   -> evaluateFollowUpPolicy()
--   ledger      -> action_events + ACTIVITY_REGISTRY
--
-- New tables are the four things Relay genuinely has no authority for: saved
-- search configuration, durable run state, provider telemetry, and the
-- org-level provider budget/status.

-- ---------------------------------------------------------------------------
-- 1. Candidates: extend the existing staging authority
-- ---------------------------------------------------------------------------

-- Daily discovery is organisation-level; it has no rep until a human promotes
-- the candidate. The manual paste path always has one.
alter table captured_prospects alter column owner_rep_id drop not null;
alter table captured_prospects alter column raw_input drop not null;

alter table captured_prospects
  add column if not exists provider text,
  add column if not exists provider_person_id text,
  add column if not exists provider_url text,
  add column if not exists search_id uuid,
  add column if not exists qualified boolean not null default false,
  add column if not exists discovered_at timestamptz;
comment on column captured_prospects.provider is
  'Discovery provider (prospeo/snov/apollo). NULL = manual paste, the original path.';
comment on column captured_prospects.provider_person_id is
  'The provider''s own person id. Dedupe is keyed on (org, provider, this id) — never on a name.';
comment on column captured_prospects.qualified is
  'Canonical qualification passed. Only qualified candidates may spend enrichment credits.';

-- The same provider person must never create two candidates.
create unique index if not exists cp_provider_person_uniq
  on captured_prospects (organization_id, provider, provider_person_id)
  where provider_person_id is not null;

create index if not exists cp_org_provider_discovered_idx
  on captured_prospects (organization_id, provider, discovered_at desc);

-- A candidate's enriched email lives in the ONE contact authority
-- (`contact_points`), keyed by the provider person until a human promotes it to
-- a lead. `lead_id` is NULL on that path, so it needs its own unique key.
create unique index if not exists cp_candidate_email_uniq
  on contact_points (organization_id, person_id, type, value_key)
  where lead_id is null and person_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Provider status + daily credit budget (one row per org/provider)
-- ---------------------------------------------------------------------------

create table if not exists provider_config (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('prospeo', 'snov', 'apollo')),

  enabled boolean not null default true,
  daily_credit_budget int not null default 0 check (daily_credit_budget >= 0),
  credits_used_today int not null default 0 check (credits_used_today >= 0),
  budget_date date,

  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  consecutive_failures int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, provider)
);

comment on table provider_config is
  'Org-level provider switch and daily credit budget. Search discovery and paid reveal spend are tracked separately in provider_search_runs.';

-- ---------------------------------------------------------------------------
-- 3. Saved searches (the daily discovery configuration)
-- ---------------------------------------------------------------------------

create table if not exists provider_saved_searches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  name text not null check (char_length(name) between 1 and 120),
  provider text not null check (provider in ('prospeo', 'snov', 'apollo')),

  titles text[] not null default '{}',
  seniority text[] not null default '{}',
  countries text[] not null default '{}',
  company_size text[] not null default '{}',
  industries text[] not null default '{}',
  -- Deterministic non-buyer exclusions. Empty = provider defaults.
  exclude_titles text[] not null default '{}',

  enabled boolean not null default true,
  pages_per_run int not null default 1 check (pages_per_run > 0),
  -- 0 = inherit the org budget in provider_config.
  daily_credit_budget int not null default 0 check (daily_credit_budget >= 0),

  -- Durable cursor: replay resumes exactly where the last run stopped.
  cursor_page int not null default 1 check (cursor_page >= 1),
  last_run_at timestamptz,

  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, name)
);

comment on table provider_saved_searches is
  'A reusable provider query plus its own cursor and credit budget. Configuration only — it never holds candidates.';

-- The FK is added after the target table exists (captured_prospects is altered
-- above, before this table is created).
alter table captured_prospects
  drop constraint if exists captured_prospects_search_id_fkey;
alter table captured_prospects
  add constraint captured_prospects_search_id_fkey
  foreign key (search_id) references provider_saved_searches(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. Durable run state (one row per search execution)
-- ---------------------------------------------------------------------------

create table if not exists provider_search_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  search_id uuid references provider_saved_searches(id) on delete set null,
  provider text not null check (provider in ('prospeo', 'snov', 'apollo')),

  status text not null default 'RUNNING'
    check (status in ('RUNNING', 'COMPLETED', 'FAILED', 'BUDGET_EXHAUSTED', 'RATE_LIMITED')),

  started_at timestamptz not null default now(),
  finished_at timestamptz,

  cursor_before int,
  cursor_after int,
  pages_fetched int not null default 0,

  candidates_discovered int not null default 0,
  duplicates_skipped int not null default 0,
  qualified int not null default 0,
  emails_revealed int not null default 0,
  credits_used int not null default 0,

  error text,
  error_category text
);

comment on table provider_search_runs is
  'Immutable run record. The scheduler outbox holds the live job; this holds what actually happened, including the cursor to resume from.';

create index if not exists psr_org_started_idx on provider_search_runs (organization_id, started_at desc);
create index if not exists psr_search_idx on provider_search_runs (search_id, started_at desc);

-- ---------------------------------------------------------------------------
-- 5. Provider telemetry (per paid operation)
-- ---------------------------------------------------------------------------

create table if not exists provider_telemetry (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  provider text not null check (provider in ('prospeo', 'snov', 'apollo')),
  operation text not null check (operation in ('SEARCH', 'ENRICH', 'REVEAL', 'VERIFY', 'FIND')),
  status text not null check (status in (
    'OK', 'RATE_LIMITED', 'INVALID_KEY', 'PLAN_REQUIRED',
    'INSUFFICIENT_CREDITS', 'INVALID_FILTERS', 'TIMEOUT', 'UNAVAILABLE', 'ERROR'
  )),

  latency_ms int,
  credits int not null default 0 check (credits >= 0),
  search_run_id uuid references provider_search_runs(id) on delete set null,
  error_category text,

  created_at timestamptz not null default now()
);

comment on table provider_telemetry is
  'Provider API telemetry. Provider calls are NOT user action_events — they are operational spend and must never reach the action ledger.';

create index if not exists pt_org_provider_idx on provider_telemetry (organization_id, provider, created_at desc);
create index if not exists pt_org_run_idx on provider_telemetry (search_run_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. RLS — organization isolation, admin-only configuration
-- ---------------------------------------------------------------------------

alter table provider_config enable row level security;
alter table provider_saved_searches enable row level security;
alter table provider_search_runs enable row level security;
alter table provider_telemetry enable row level security;

-- Reads: any signed-in org member. Configuration writes: admins only.
drop policy if exists "provider_config_select" on provider_config;
create policy "provider_config_select" on provider_config
  for select to authenticated using (organization_id = current_org_id());
drop policy if exists "provider_config_insert" on provider_config;
create policy "provider_config_insert" on provider_config
  for insert to authenticated with check (organization_id = current_org_id() and is_org_admin());
drop policy if exists "provider_config_update" on provider_config;
create policy "provider_config_update" on provider_config
  for update to authenticated
  using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "ps_search_select" on provider_saved_searches;
create policy "ps_search_select" on provider_saved_searches
  for select to authenticated using (organization_id = current_org_id());
drop policy if exists "ps_search_insert" on provider_saved_searches;
create policy "ps_search_insert" on provider_saved_searches
  for insert to authenticated with check (organization_id = current_org_id() and is_org_admin());
drop policy if exists "ps_search_update" on provider_saved_searches;
create policy "ps_search_update" on provider_saved_searches
  for update to authenticated
  using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());
drop policy if exists "ps_search_delete" on provider_saved_searches;
create policy "ps_search_delete" on provider_saved_searches
  for delete to authenticated using (organization_id = current_org_id() and is_org_admin());

drop policy if exists "ps_run_select" on provider_search_runs;
create policy "ps_run_select" on provider_search_runs
  for select to authenticated using (organization_id = current_org_id());

drop policy if exists "pt_select" on provider_telemetry;
create policy "pt_select" on provider_telemetry
  for select to authenticated using (organization_id = current_org_id());

comment on table captured_prospects is
  'The one prospect staging authority. Manual pastes have an owner rep; provider discovery is org-level until a human promotes it. Status: captured | converted | discarded.';
