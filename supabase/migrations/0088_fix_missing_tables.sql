-- 0088: Fix missing tables that were in skipped migrations
-- These CREATE TABLE statements were extracted from migrations 0081, 0085, 0086
-- which had seed data that failed on fresh apply.

-- From 0081: revenue_identities
create table if not exists revenue_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  slug text not null,
  identity_name text not null,
  title text,
  positioning text,
  skills jsonb default '[]'::jsonb,
  expertise jsonb default '[]'::jsonb,
  industries jsonb default '[]'::jsonb,
  technologies jsonb default '[]'::jsonb,
  allowed_first_person_claims jsonb default '[]'::jsonb,
  voice_tone jsonb,
  preferred_opportunity_types jsonb default '[]'::jsonb,
  proposal_positioning text,
  profile_id uuid references profiles(id),
  status text default 'active',
  channel text default 'linkedin',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- From 0081: identity_assignments
create table if not exists identity_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  assigned_by uuid references reps(id),
  created_at timestamptz default now(),
  unique(revenue_identity_id, rep_id)
);

-- From 0081: activity_log
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  event_type text not null,
  actor_id uuid references reps(id),
  revenue_identity_id uuid references revenue_identities(id),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- From 0081: style_cards
create table if not exists style_cards (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references reps(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  style_card jsonb not null,
  sample_source text default 'pasted_samples',
  calibrated_at timestamptz,
  created_at timestamptz default now()
);

-- From 0085: daily_targets (use targets for simplicity)
create table if not exists targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid references reps(id) on delete cascade,
  revenue_identity_id uuid references revenue_identities(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  metric text not null,
  target_value integer not null default 0,
  current_value integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table targets rename to daily_targets;

-- From 0085: daily_accountability
create table if not exists daily_accountability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  activity_date date not null,
  metric text not null,
  value integer not null default 0,
  source_event_id uuid,
  created_at timestamptz default now()
);

-- From 0085: accountability_audit_log
create table if not exists accountability_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references reps(id),
  action text not null,
  target_table text,
  target_id uuid,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz default now()
);

-- From 0085: notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid references reps(id) on delete cascade,
  type text not null,
  title text,
  message text,
  metadata jsonb default '{}'::jsonb,
  read boolean default false,
  created_at timestamptz default now()
);

-- From 0086: relay_events
create table if not exists relay_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  event_type text not null,
  actor_rep_id uuid references reps(id),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- From 0086: relay_runs
create table if not exists relay_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  run_type text not null,
  primary_entity_type text not null,
  primary_entity_id uuid not null,
  status text default 'pending',
  current_phase text,
  assigned_rep_id uuid references reps(id),
  sender_profile_id uuid references profiles(id),
  strategy_snapshot jsonb,
  result_snapshot jsonb,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);
