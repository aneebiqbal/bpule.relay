-- ============================================================================
-- RELAY V4 — Operations Autopilot Foundation
--
-- The daily operating layer: one explicit availability state per rep per day,
-- primary/backup profile coverage, temporary coverage with expiry, readiness
-- acknowledgement, and the audit trail for every coverage change.
--
-- Nothing here replaces an existing authority:
--   * eligibility still comes from `identity_assignments` + `revenue_identities`
--   * the day lifecycle still comes from `rep_day`
--   * notifications still come from `notifications`
--   * tasks still come from `assigned_tasks`
--
-- `rep_availability` is additive: when no explicit row exists the engine falls
-- back to the canonical `rep_day` state. Leave is never inferred from silence.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. One canonical daily availability state per rep
-- ---------------------------------------------------------------------------

create table if not exists rep_availability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  business_date date not null,

  state text not null check (state in (
    'AVAILABLE', 'WORKING', 'ON_LEAVE', 'OFFLINE', 'CHECKED_OUT', 'UNAVAILABLE'
  )),
  -- Who decided it: an approved schedule, the rep, a manager, an admin, or
  -- the system. `SCHEDULE` is the only non-explicit source.
  source text not null default 'SCHEDULE'
    check (source in ('SCHEDULE', 'SELF', 'MANAGER', 'ADMIN', 'SYSTEM')),
  note text,

  -- A leave/unavailable block may span days; the row is still one day.
  effective_from date,
  effective_until date,

  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, rep_id, business_date),
  constraint ra_window_order check (effective_until is null or effective_from is null or effective_from <= effective_until)
);

create index if not exists ra_org_date_idx on rep_availability (organization_id, business_date desc);
create index if not exists ra_rep_idx on rep_availability (rep_id, business_date desc);

alter table rep_availability enable row level security;

drop policy if exists "ra_select" on rep_availability;
create policy "ra_select" on rep_availability for select
  to authenticated using (
    organization_id = current_org_id()
    and (
      rep_id = current_rep_id()
      or is_org_admin()
      or is_org_manager_of(rep_id)
    )
  );

-- A rep may set their own availability. Managers may set it for a managed
-- rep; admins for anyone. Enforced in the database, not only the route.
drop policy if exists "ra_insert" on rep_availability;
create policy "ra_insert" on rep_availability for insert
  to authenticated with check (
    organization_id = current_org_id()
    and (
      rep_id = current_rep_id()
      or is_org_admin()
      or is_org_manager_of(rep_id)
    )
  );

drop policy if exists "ra_update" on rep_availability;
create policy "ra_update" on rep_availability for update
  to authenticated using (
    organization_id = current_org_id()
    and (
      rep_id = current_rep_id()
      or is_org_admin()
      or is_org_manager_of(rep_id)
    )
  )
  with check (
    organization_id = current_org_id()
    and (
      rep_id = current_rep_id()
      or is_org_admin()
      or is_org_manager_of(rep_id)
    )
  );

comment on table rep_availability is
  'One explicit operational availability state per rep per business date. Absent row means "no explicit state" — the engine falls back to rep_day, never to a guess.';

-- ---------------------------------------------------------------------------
-- 2. Primary / backup coverage configuration
--
--    Reuses `profiles` (the sender account) and `identity_assignments` (the
--    eligibility authority). This table only records who is primary and who
--    the ordered backups are — it grants no access by itself.
-- ---------------------------------------------------------------------------

create table if not exists profile_coverage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  role text not null check (role in ('PRIMARY', 'BACKUP')),
  priority int not null default 1 check (priority >= 1),
  active boolean not null default true,
  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uniqueness applies to the ACTIVE chain only. Reconfiguring a profile
-- deactivates the previous chain rather than deleting it, so the history stays
-- queryable and a later re-configuration can reuse the same rep/priority.
create unique index if not exists pc_one_primary_idx
  on profile_coverage (profile_id) where role = 'PRIMARY' and active;

create unique index if not exists pc_active_chain_uniq
  on profile_coverage (organization_id, profile_id, role, priority) where active;

create unique index if not exists pc_active_rep_uniq
  on profile_coverage (profile_id, rep_id) where active;

create index if not exists pc_profile_idx on profile_coverage (profile_id, role, priority);
create index if not exists pc_rep_idx on profile_coverage (rep_id) where active;

alter table profile_coverage enable row level security;

drop policy if exists "pc_select" on profile_coverage;
create policy "pc_select" on profile_coverage for select
  to authenticated using (organization_id = current_org_id());

-- Backup configuration is an Admin/Owner action (§30).
drop policy if exists "pc_insert" on profile_coverage;
create policy "pc_insert" on profile_coverage for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "pc_update" on profile_coverage;
create policy "pc_update" on profile_coverage for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "pc_delete" on profile_coverage;
create policy "pc_delete" on profile_coverage for delete
  to authenticated using (organization_id = current_org_id() and is_org_admin());

comment on table profile_coverage is
  'Ordered coverage configuration per sending profile. PRIMARY is the owner of record; BACKUP rows are the ordered fallback chain. Eligibility to cover is still proven by identity_assignments.';

-- ---------------------------------------------------------------------------
-- 3. Temporary coverage assignments (the approved plan, made real)
--
--    This is the audit trail and the live state in one: every activation,
--    expiry, revocation and restore is a row plus a coverage_events entry.
--    Historical attribution is never rewritten — coverage is execution
--    responsibility, not ownership.
-- ---------------------------------------------------------------------------

create table if not exists coverage_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  primary_rep_id uuid not null references reps(id) on delete cascade,
  covering_rep_id uuid not null references reps(id) on delete cascade,

  effective_from date not null,
  effective_until date,
  reason text not null check (char_length(reason) between 1 and 500),

  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'EXPIRED', 'REVOKED', 'COMPLETED')),

  approved_by uuid references reps(id) on delete set null,
  created_by uuid not null references reps(id) on delete cascade,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references reps(id) on delete set null,
  revoke_reason text,

  constraint ca_reps_differ check (primary_rep_id <> covering_rep_id)
);

create index if not exists ca_org_active_idx
  on coverage_assignments (organization_id, status, effective_from desc);
create index if not exists ca_profile_idx on coverage_assignments (profile_id, status);
create index if not exists ca_covering_idx on coverage_assignments (covering_rep_id, status);

alter table coverage_assignments enable row level security;

drop policy if exists "ca_select" on coverage_assignments;
create policy "ca_select" on coverage_assignments for select
  to authenticated using (
    organization_id = current_org_id()
    and (
      covering_rep_id = current_rep_id()
      or primary_rep_id = current_rep_id()
      or is_org_admin()
      or is_org_manager_of(covering_rep_id)
      or is_org_manager_of(primary_rep_id)
    )
  );

drop policy if exists "ca_insert" on coverage_assignments;
create policy "ca_insert" on coverage_assignments for insert
  to authenticated with check (
    organization_id = current_org_id()
    and created_by = current_rep_id()
    and is_org_admin()
  );

drop policy if exists "ca_update" on coverage_assignments;
create policy "ca_update" on coverage_assignments for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

comment on table coverage_assignments is
  'A temporary execution responsibility: who covers which profile, for how long, why, and who approved it. Never a change of ownership or historical attribution.';

-- ---------------------------------------------------------------------------
-- 4. Coverage events — immutable audit of every change
-- ---------------------------------------------------------------------------

create table if not exists coverage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  assignment_id uuid references coverage_assignments(id) on delete set null,

  event_type text not null check (event_type in (
    'COVERAGE_ACTIVATED',
    'COVERAGE_EXPIRED',
    'COVERAGE_REVOKED',
    'COVERAGE_RESTORED',
    'COVERAGE_COMPLETED',
    'BACKUP_CONFIGURED'
  )),

  primary_rep_id uuid references reps(id) on delete set null,
  covering_rep_id uuid references reps(id) on delete set null,
  reason text,
  effective_from date,
  effective_until date,

  actor_rep_id uuid references reps(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ce_org_idx on coverage_events (organization_id, created_at desc);
create index if not exists ce_profile_idx on coverage_events (profile_id, created_at desc);
create index if not exists ce_assignment_idx on coverage_events (assignment_id, created_at desc);

alter table coverage_events enable row level security;

drop policy if exists "ce_select" on coverage_events;
create policy "ce_select" on coverage_events for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "ce_insert" on coverage_events;
create policy "ce_insert" on coverage_events for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

comment on table coverage_events is
  'Immutable audit of every coverage change. No update or delete policy: the trail survives the API.';

-- ---------------------------------------------------------------------------
-- 5. Profile readiness — explicit "I can work this on this device"
--
--    Operational confirmation only. Relay never stores passwords, cookies,
--    MFA secrets or browser session state (§31).
-- ---------------------------------------------------------------------------

create table if not exists profile_readiness (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  acknowledged_by uuid not null references reps(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  note text,
  unique (organization_id, profile_id, rep_id)
);

create index if not exists pr_profile_idx on profile_readiness (profile_id);
create index if not exists pr_rep_idx on profile_readiness (rep_id);

alter table profile_readiness enable row level security;

drop policy if exists "pr_select" on profile_readiness;
create policy "pr_select" on profile_readiness for select
  to authenticated using (
    organization_id = current_org_id()
    and (
      rep_id = current_rep_id()
      or is_org_admin()
      or is_org_manager_of(rep_id)
    )
  );

drop policy if exists "pr_insert" on profile_readiness;
create policy "pr_insert" on profile_readiness for insert
  to authenticated with check (
    organization_id = current_org_id()
    and rep_id = current_rep_id()
    and acknowledged_by = current_rep_id()
  );

drop policy if exists "pr_update" on profile_readiness;
create policy "pr_update" on profile_readiness for update
  to authenticated using (
    organization_id = current_org_id()
    and rep_id = current_rep_id()
  )
  with check (
    organization_id = current_org_id()
    and rep_id = current_rep_id()
  );

comment on table profile_readiness is
  'A rep''s explicit confirmation that a profile is usable on their device. Not a credential store; revocable by the same rep.';

-- ---------------------------------------------------------------------------
-- 6. Operating policy: coverage mode + overload limit
--
--    Default is APPROVAL_REQUIRED: the first release recommends, it never
--    silently reassigns. `maxProfilesPerRep` is the overload ceiling.
-- ---------------------------------------------------------------------------

alter table organization_operating_policy
  add column if not exists coverage_policy text not null default 'APPROVAL_REQUIRED'
    check (coverage_policy in ('AUTO_COVER', 'APPROVAL_REQUIRED', 'MANUAL_ONLY'));

alter table organization_operating_policy
  add column if not exists coverage_limits jsonb not null default '{"maxProfilesPerRep":3}'::jsonb;

comment on column organization_operating_policy.coverage_policy is
  'How structural coverage changes are applied. APPROVAL_REQUIRED is the only mode the first release acts on; the engine derives the plan in every mode.';
comment on column organization_operating_policy.coverage_limits is
  'Overload protection ceilings. maxProfilesPerRep bounds a rep''s own profiles plus active coverage.';

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   select state, count(*) from rep_availability group by state;
--   select profile_id, role, priority, rep_id from profile_coverage order by profile_id, role, priority;
--   select status, count(*) from coverage_assignments group by status;
--   select coverage_policy, coverage_limits from organization_operating_policy;
-- ---------------------------------------------------------------------------
