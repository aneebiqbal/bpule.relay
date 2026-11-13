-- RELAY V7 — Operator schedules (multi-operator shifts).
--
-- ONE profile → ONE PRIMARY → ZERO OR MORE active OPERATORS (V6.1.1).
-- This migration adds WHEN each operator works the profile.
--
-- The schedule is keyed by PROFILE, not revenue_identity, because that is the
-- level the existing responsibility authority already uses (`profile_coverage`
-- roles and `listExecutableIdentitiesForRep`). A second identity-level
-- authority would let the two disagree about who may execute.
--
-- A shift may cross midnight (22:00 → 06:00, or 16:00 → 00:00). `end_time`
-- is exclusive. `days_of_week` is the day the shift STARTS on (0 = Sunday),
-- so a Monday 22:00 → 06:00 shift also covers Tuesday 00:00 → 06:00.
--
-- Schedules never change ownership. They are a child of the shared lane and
-- only decide which operators are executable at a given instant.

create table if not exists responsibility_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,

  -- Wall-clock shift, in the organization's timezone.
  start_time time not null,
  end_time time not null,
  -- ISO day-of-week the shift starts on: 0=Sunday … 6=Saturday.
  days_of_week int[] not null default '{0,1,2,3,4,5,6}',
  timezone text not null default 'UTC',

  effective_from date not null default current_date,
  effective_until date,
  active boolean not null default true,

  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A shift must have a non-empty day set and a real duration.
  check (cardinality(days_of_week) > 0),
  check (start_time <> end_time)
);

-- One active shift per (profile, rep, start_time, day) — the admin saves a
-- schedule as a set of rows; a duplicate is a no-op, never a double seat.
create unique index if not exists rs_active_shift_uniq
  on responsibility_schedules (organization_id, profile_id, rep_id, start_time, days_of_week)
  where active;

create index if not exists rs_profile_idx on responsibility_schedules (profile_id);
create index if not exists rs_org_active_idx on responsibility_schedules (organization_id, active);
create index if not exists rs_rep_idx on responsibility_schedules (rep_id);

alter table responsibility_schedules enable row level security;

-- Reps may read schedules for profiles they work; only admins may write.
drop policy if exists "rs_select" on responsibility_schedules;
create policy "rs_select" on responsibility_schedules
  for select to authenticated using (
    organization_id = current_org_id()
    and (
      is_org_admin()
      or exists (
        select 1 from profile_coverage pc
        where pc.profile_id = responsibility_schedules.profile_id
          and pc.rep_id = current_rep_id()
          and pc.active
      )
    )
  );

drop policy if exists "rs_insert" on responsibility_schedules;
create policy "rs_insert" on responsibility_schedules
  for insert to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rs_update" on responsibility_schedules;
create policy "rs_update" on responsibility_schedules
  for update to authenticated
  using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rs_delete" on responsibility_schedules;
create policy "rs_delete" on responsibility_schedules
  for delete to authenticated using (organization_id = current_org_id() and is_org_admin());

comment on table responsibility_schedules is
  'Operator shift windows per profile. A child of the shared channel plan: it decides WHO is executable at an instant, never who owns the profile. Shifts may cross midnight; days_of_week is the start day.';

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   -- No rep holds two active shifts on the same profile that overlap.
--   select organization_id, profile_id, rep_id, count(*)
--   from responsibility_schedules where active
--   group by 1, 2, 3 having count(*) > 1;   -- expected: 0 (one seat per rep)
-- ---------------------------------------------------------------------------
