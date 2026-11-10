-- RELAY V6.0 — Multi-operator responsibility foundation.
--
-- Adds the coverage EXECUTION mode (SHARED / REPLACE) to temporary coverage,
-- and one canonical acknowledgement authority for both permanent and temporary
-- responsibility. Readiness (profile_readiness) is untouched and never
-- overloaded.
--
-- Classification of existing rows (§44 of the design):
--   coverage_assignments holds 7 rows, ALL status = COMPLETED. There are ZERO
--   active coverage rows, so nothing is ambiguous and nothing is reclassified.
--   Existing rows keep coverage_mode = NULL (unknown / historical).
--
-- Idempotent; safe to run on production as-is.

-- ---------------------------------------------------------------------------
-- 1. Coverage execution mode
-- ---------------------------------------------------------------------------

alter table coverage_assignments
  add column if not exists coverage_mode text
  check (coverage_mode in ('SHARED', 'REPLACE'));

comment on column coverage_assignments.coverage_mode is
  'How temporary coverage executes. SHARED: primary keeps executing alongside the covering rep. REPLACE: covering rep executes, primary is excluded until the window ends. NULL = historical row, unknown.';

alter table coverage_events
  add column if not exists coverage_mode text
  check (coverage_mode in ('SHARED', 'REPLACE'));

comment on column coverage_events.coverage_mode is
  'The execution mode of the coverage this event describes, so history renders SHARED vs REPLACE without parsing the reason.';

-- ---------------------------------------------------------------------------
-- 2. Responsibility acknowledgement — one authority for PRIMARY and COVERAGE
-- ---------------------------------------------------------------------------

create table if not exists responsibility_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,

  subject text not null check (subject in ('PRIMARY', 'COVERAGE')),
  coverage_assignment_id uuid references coverage_assignments(id) on delete cascade,
  -- The ownership/coverage row this acknowledgement belongs to. A genuinely new
  -- assignment episode re-arms the banner; re-saving an unchanged chain does not.
  source_row_id uuid,

  assigned_at timestamptz not null,
  acknowledged_at timestamptz,

  access_issue text check (access_issue in (
    'CANNOT_LOG_IN', 'CREDENTIALS_MISSING', 'TWO_FA_BLOCKED',
    'ACCOUNT_RESTRICTED', 'OTHER'
  )),
  access_issue_note text,
  access_issue_at timestamptz,
  access_issue_reported_by uuid references reps(id) on delete set null,

  resolved_at timestamptz,
  resolved_by uuid references reps(id) on delete set null,
  resolve_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One acknowledgement per (profile, rep) for permanent ownership.
create unique index if not exists ack_primary_uniq
  on responsibility_acknowledgements (organization_id, profile_id, rep_id)
  where subject = 'PRIMARY';

-- One acknowledgement per coverage assignment.
create unique index if not exists ack_coverage_uniq
  on responsibility_acknowledgements (coverage_assignment_id)
  where subject = 'COVERAGE' and coverage_assignment_id is not null;

create index if not exists ack_org_unacknowledged_idx
  on responsibility_acknowledgements (organization_id, acknowledged_at)
  where acknowledged_at is null;
create index if not exists ack_profile_idx on responsibility_acknowledgements (profile_id);
create index if not exists ack_rep_idx on responsibility_acknowledgements (rep_id);
create index if not exists ack_org_access_issue_idx
  on responsibility_acknowledgements (organization_id, access_issue_at)
  where access_issue_at is not null and resolved_at is null;

alter table responsibility_acknowledgements enable row level security;

drop policy if exists "ack_select" on responsibility_acknowledgements;
create policy "ack_select" on responsibility_acknowledgements
  for select to authenticated using (
    organization_id = current_org_id()
    and (
      rep_id = current_rep_id()
      or is_org_admin()
      or is_org_manager_of(rep_id)
    )
  );

-- Activation writes ack rows whose rep_id is the RECIPIENT, not the actor, so
-- the admin arm is required. A rep may always acknowledge their own.
drop policy if exists "ack_insert" on responsibility_acknowledgements;
create policy "ack_insert" on responsibility_acknowledgements
  for insert to authenticated with check (
    organization_id = current_org_id()
    and (rep_id = current_rep_id() or is_org_admin())
  );

drop policy if exists "ack_update" on responsibility_acknowledgements;
create policy "ack_update" on responsibility_acknowledgements
  for update to authenticated
  using (
    organization_id = current_org_id()
    and (rep_id = current_rep_id() or is_org_admin() or is_org_manager_of(rep_id))
  )
  with check (
    organization_id = current_org_id()
    and (rep_id = current_rep_id() or is_org_admin() or is_org_manager_of(rep_id))
  );

drop policy if exists "ack_delete" on responsibility_acknowledgements;
create policy "ack_delete" on responsibility_acknowledgements
  for delete to authenticated using (
    organization_id = current_org_id() and is_org_admin()
  );

comment on table responsibility_acknowledgements is
  'One canonical acknowledgement authority. ACKNOWLEDGED = "I saw and accepted this responsibility". ACCESS ISSUE = "I cannot operate this account". Neither implies the other, and neither changes ownership or execution.';
