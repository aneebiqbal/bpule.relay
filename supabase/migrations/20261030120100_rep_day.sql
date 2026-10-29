-- ============================================================================
-- I2 — Rep Day
--
-- Before this migration a rep's day was not a record. `daily_accountability`
-- is unique on (rep, identity, activity_type, date) and `day_closes` on
-- (person, identity, date), so a rep assigned to four identities had four
-- close records and N target rows. "62% of today's commitment" had to be
-- recomputed by summing across identities on every page load, and no row
-- carried the rep's state, pace or minutes remaining.
--
-- `rep_day` is that row. It aggregates the detailed per-identity rows; it does
-- not duplicate them. `daily_accountability` and `day_closes` remain the
-- attribution source and the immutable history.
--
-- `rep_day` starts at the policy cutover date. Days before it keep whatever
-- date they were written with and are never reinterpreted.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. organization_day — one organization-local operating day
-- ---------------------------------------------------------------------------

create table if not exists organization_day (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  business_date date not null,
  state text not null default 'OPEN' check (state in ('OPEN', 'CLOSED')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, business_date)
);

create index if not exists od_org_date_idx on organization_day (organization_id, business_date desc);

alter table organization_day enable row level security;

drop policy if exists "od_select" on organization_day;
create policy "od_select" on organization_day for select
  to authenticated using (organization_id = current_org_id());

-- Only the service role (the operational worker) opens and closes days.
-- No authenticated write policy: an operating day is system-owned.

comment on table organization_day is
  'One organization-local operating day. Opened and closed by the operational scheduler.';

-- ---------------------------------------------------------------------------
-- 2. rep_day — the rep's day as a single record
-- ---------------------------------------------------------------------------

create table if not exists rep_day (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  business_date date not null,

  state text not null default 'NOT_STARTED' check (state in (
    'NOT_STARTED', 'ACTIVE', 'AT_RISK', 'CRITICAL',
    'READY_TO_CLOSE', 'CLOSED', 'MISSED'
  )),

  check_in_at timestamptz,
  closed_at timestamptz,

  -- 0..1 fractions, computed by the canonical pacing function
  workday_progress numeric(5,4) not null default 0
    check (workday_progress >= 0 and workday_progress <= 1),
  commitment_progress numeric(5,4) not null default 0
    check (commitment_progress >= 0 and commitment_progress <= 1),
  -- completed / expected; null when no work was expected yet
  pace_ratio numeric(6,3),

  minutes_remaining int not null default 0 check (minutes_remaining >= 0),
  required_remaining int not null default 0 check (required_remaining >= 0),

  exception_state text not null default 'NONE'
    check (exception_state in ('NONE', 'REQUESTED', 'APPROVED', 'REJECTED')),
  exception_reason text,
  exception_note text,
  reviewed_by uuid references reps(id) on delete set null,
  reviewed_at timestamptz,

  -- Immutable record of what was not done. Never erased.
  shortfall jsonb not null default '{}'::jsonb,
  -- What the next operating day inherits.
  carryover jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, rep_id, business_date)
);

create index if not exists rd_org_date_idx on rep_day (organization_id, business_date desc);
create index if not exists rd_org_state_idx on rep_day (organization_id, business_date, state);
create index if not exists rd_rep_date_idx on rep_day (rep_id, business_date desc);

alter table rep_day enable row level security;

-- A rep reads their own day.
drop policy if exists "rd_select" on rep_day;
create policy "rd_select" on rep_day for select
  to authenticated using (
    organization_id = current_org_id()
    and (
      rep_id = current_rep_id()
      or is_org_admin()
      -- A manager reads the days of people on teams they manage.
      or exists (
        select 1
        from team_memberships managed
        join team_memberships member on member.team_id = managed.team_id
        where managed.person_id = current_rep_id()
          and managed.membership_role = 'MANAGER'
          and managed.active
          and member.person_id = rep_day.rep_id
          and member.active
      )
    )
  );

-- A rep may check themselves in, and only themselves, in their own org.
drop policy if exists "rd_insert_self" on rep_day;
create policy "rd_insert_self" on rep_day for insert
  to authenticated with check (
    organization_id = current_org_id()
    and rep_id = current_rep_id()
  );

-- State transitions are written by the server (check-in, close) and the
-- operational worker. A rep may update their own row; the API is what decides
-- which transitions are legal — the database enforces ownership, not policy.
drop policy if exists "rd_update_self" on rep_day;
create policy "rd_update_self" on rep_day for update
  to authenticated using (
    organization_id = current_org_id()
    and (rep_id = current_rep_id() or is_org_admin())
  )
  with check (
    organization_id = current_org_id()
    and (rep_id = current_rep_id() or is_org_admin())
  );

comment on table rep_day is
  'One rep, one organization-local business date: state, check-in, pace, shortfall, carryover. Aggregates daily_accountability and day_closes; never replaces them.';

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   select business_date, state, check_in_at, pace_ratio, minutes_remaining
--   from rep_day order by business_date desc limit 5;
--
--   -- A rep must not see another rep's day.
--   -- (run as a member of a different org / different rep)
--   select count(*) from rep_day;   -- only own + team/admin-visible rows
-- ---------------------------------------------------------------------------
