-- ============================================================================
-- RELAY FOUNDATION APPLY
-- Generated from the authoritative migrations, concatenated in order.
-- Nothing here is rewritten. Run the whole file once in the Supabase SQL Editor.
-- All statements are additive; the only data written is the default policy seed.
-- ============================================================================

-- MIGRATION 1
-- organization operating clock

-- ============================================================================
-- I1 — Organization Operating Clock
--
-- One organization-local time authority. Before this migration the business
-- date was `new Date().toISOString().slice(0,10)` (UTC) and the workday window
-- was hardcoded 09:00–17:00 in TypeScript. `organizations.timezone` existed but
-- never reached the day boundary, and `record_activity_event` wrote
-- `target_date = current_date` (the database's UTC date).
--
-- This migration:
--   1. adds `organization_operating_policy` (timezone, workday window, working
--      days, reset time, warning thresholds, target pack, cutover date)
--   2. seeds the real organization with its stated policy
--   3. makes `is_org_working_day` read the policy first
--   4. lets `record_activity_event` accept the organization-local business date
--
-- Historical rows are never reinterpreted. `cutover_date` marks the first day
-- the organization-local boundary is authoritative; anything earlier keeps the
-- date it was written with.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The policy
-- ---------------------------------------------------------------------------

create table if not exists organization_operating_policy (
  organization_id uuid primary key references organizations(id) on delete cascade,
  timezone text not null default 'UTC',
  workday_start time not null default '09:00',
  workday_end time not null default '18:00',
  -- 0 = Sunday … 6 = Saturday, matching Postgres `extract(dow)`.
  working_days int[] not null default '{1,2,3,4,5}',
  daily_reset_time time not null default '00:00',
  warning_thresholds jsonb not null default jsonb_build_object(
    'riskStartPct', 25,
    'riskPaceRatio', 0.8,
    'criticalStartPct', 75,
    'criticalPaceRatio', 0.6,
    'finalStartPct', 90
  ),
  -- The default commitment pack. Targets are configuration, never business
  -- logic: the rep-day aggregator reads them, it does not know their names.
  target_pack jsonb not null default '[]'::jsonb,
  cutover_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oop_timezone_present check (length(btrim(timezone)) > 0),
  constraint oop_window_order check (workday_start < workday_end),
  constraint oop_working_days_valid check (
    working_days <@ array[0,1,2,3,4,5,6]::int[] and array_length(working_days, 1) > 0
  )
);

comment on table organization_operating_policy is
  'One operating clock per organization. Business dates, workday progress and warning thresholds derive from this row.';
comment on column organization_operating_policy.cutover_date is
  'First business date the organization-local boundary is authoritative. Earlier rows keep their historical (UTC-derived) date.';

alter table organization_operating_policy enable row level security;

drop policy if exists "oop_select" on organization_operating_policy;
create policy "oop_select" on organization_operating_policy for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "oop_insert" on organization_operating_policy;
create policy "oop_insert" on organization_operating_policy for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "oop_update" on organization_operating_policy;
create policy "oop_update" on organization_operating_policy for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ---------------------------------------------------------------------------
-- 2. Seed: the real organization's stated policy
--    Asia/Karachi · 09:00–18:00 · Mon–Fri · reset 00:00 local
-- ---------------------------------------------------------------------------

insert into organization_operating_policy (
  organization_id, timezone, workday_start, workday_end, working_days,
  daily_reset_time, target_pack, cutover_date
)
select
  o.id,
  'Asia/Karachi',
  '09:00'::time,
  '18:00'::time,
  '{1,2,3,4,5}'::int[],
  '00:00'::time,
  '[
    {"key":"profiles_supplied","label":"Profiles","target":25,"unit":"count"},
    {"key":"emails_supplied","label":"Emails","target":20,"unit":"count"},
    {"key":"jobs_reviewed","label":"Jobs","target":15,"unit":"count"},
    {"key":"qualified_opportunities","label":"Qualified","target":8,"unit":"count"},
    {"key":"outbound_actions","label":"Outbound","target":15,"unit":"count"},
    {"key":"followups_completed","label":"Follow-ups","target":10,"unit":"count"},
    {"key":"replies_handled","label":"Replies","target":100,"unit":"percent"}
  ]'::jsonb,
  current_date
from organizations o
where o.id = '11111111-1111-1111-1111-111111111111'
on conflict (organization_id) do nothing;

-- Every other organization gets a policy derived from what it already declares,
-- so no organization is left without a clock.
insert into organization_operating_policy (organization_id, timezone, working_days)
select
  o.id,
  coalesce(nullif(btrim(o.timezone), ''), 'UTC'),
  coalesce(o.working_days, '{1,2,3,4,5}'::int[])
from organizations o
where not exists (
  select 1 from organization_operating_policy p where p.organization_id = o.id
)
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Working-day check reads the policy first, organizations as fallback
-- ---------------------------------------------------------------------------

create or replace function public.is_org_working_day(
  p_org_id uuid,
  p_date date
) returns boolean
language sql stable security definer set search_path = public as
$$
  select
    coalesce(
      (
        select extract(dow from p_date)::int = any(
          coalesce(
            (select p.working_days from organization_operating_policy p where p.organization_id = o.id),
            o.working_days
          )
        )
        from organizations o
        where o.id = p_org_id
      ),
      false
    )
    and not exists (
      select 1
      from organizations o,
      jsonb_array_elements(coalesce(o.holidays, '[]'::jsonb)) h
      where o.id = p_org_id
        and (h->>'date')::date = p_date
    );
$$;

comment on function public.is_org_working_day(uuid, date) is
  'True when p_date is a working day for the organization. p_date must already be the organization-local business date.';

-- ---------------------------------------------------------------------------
-- 4. record_activity_event accepts the organization-local business date
--
--    `create or replace` cannot add a parameter, so the 5-argument form is
--    dropped and recreated with `p_date`. Named-argument callers are
--    unaffected; the parameter is optional and falls back to current_date.
-- ---------------------------------------------------------------------------

drop function if exists public.record_activity_event(uuid, uuid, text, uuid, text);

create or replace function public.record_activity_event(
  p_rep_id uuid,
  p_identity_id uuid,
  p_activity_type text,
  p_org_id uuid,
  p_source_event_id text default null,
  p_date date default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
  v_target_count int;
  v_completed int;
  v_status text;
  v_existing_id uuid;
  v_is_working boolean;
  v_already_recorded boolean;
begin
  v_date := coalesce(p_date, current_date);

  -- Exactly-once: if caller supplied a source_event_id and this
  -- accountability row already contains it, return the current state
  -- without incrementing.
  if p_source_event_id is not null then
    select source_event_ids @> array[p_source_event_id]
    into v_already_recorded
    from daily_accountability
    where rep_id = p_rep_id
      and revenue_identity_id = p_identity_id
      and activity_type = p_activity_type
      and target_date = v_date
    limit 1;

    if v_already_recorded then
      select completed_count, target_count
      into v_completed, v_target_count
      from daily_accountability
      where rep_id = p_rep_id
        and revenue_identity_id = p_identity_id
        and activity_type = p_activity_type
        and target_date = v_date
      limit 1;
      return json_build_object(
        'recorded', false,
        'reason', 'already_recorded',
        'completed_count', coalesce(v_completed, 0),
        'target_count', coalesce(v_target_count, 0)
      );
    end if;
  end if;

  v_is_working := public.is_org_working_day(p_org_id, v_date);

  if not v_is_working then
    return json_build_object('recorded', false, 'reason', 'not_working_day');
  end if;

  select coalesce(
    (select target_count from daily_targets
     where rep_id = p_rep_id
       and revenue_identity_id = p_identity_id
       and activity_type = p_activity_type
       and active = true
     limit 1),
    0
  ) into v_target_count;

  insert into daily_accountability (
    organization_id, rep_id, revenue_identity_id, activity_type,
    target_date, target_count, completed_count, status, closed, source_event_ids
  ) values (
    p_org_id, p_rep_id, p_identity_id, p_activity_type,
    v_date, v_target_count, 1, 'on_track', false,
    case when p_source_event_id is not null
         then array[p_source_event_id]
         else '{}'::text[] end
  )
  on conflict (rep_id, revenue_identity_id, activity_type, target_date)
  do update set
    completed_count = daily_accountability.completed_count + 1,
    source_event_ids = case
      when p_source_event_id is not null
           and not (daily_accountability.source_event_ids @> array[p_source_event_id])
      then array_append(daily_accountability.source_event_ids, p_source_event_id)
      else daily_accountability.source_event_ids
    end,
    updated_at = now()
  where daily_accountability.closed = false
  returning id, completed_count, target_count into v_existing_id, v_completed, v_target_count;

  if v_completed >= v_target_count and v_target_count > 0 then
    v_status := 'completed';
  else
    v_status := 'on_track';
  end if;

  update daily_accountability set status = v_status where id = v_existing_id;

  return json_build_object(
    'recorded', true,
    'completed_count', v_completed,
    'target_count', v_target_count,
    'status', v_status
  );
end;
$$;

comment on function public.record_activity_event(uuid, uuid, text, uuid, text, date) is
  'Increments daily_accountability exactly once per source event, on the caller-supplied organization-local business date.';

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   select organization_id, timezone, workday_start, workday_end, working_days,
--          daily_reset_time, cutover_date
--   from organization_operating_policy;
--
--   select public.is_org_working_day(
--     '11111111-1111-1111-1111-111111111111', date '2026-10-31');  -- false (Sat)
--   select public.is_org_working_day(
--     '11111111-1111-1111-1111-111111111111', date '2026-11-02');  -- true  (Mon)
-- ---------------------------------------------------------------------------

-- MIGRATION 2
-- rep day

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

-- MIGRATION 3
-- operational scheduler

-- ============================================================================
-- I3 — Operational Scheduler (durable outbox)
--
-- Before this migration, accountability warnings existed only if a rep loaded
-- a page after the threshold time. `vercel.json` had five fixed-UTC crons and
-- none of them evaluated a warning, reset a day, closed a missed day or
-- scheduled a follow-up.
--
-- `operational_jobs` is the durable outbox the worker drains. Every row is
-- identified by a deterministic key, so a duplicate worker invocation (Vercel
-- retry, overlapping cron, two regions) is a no-op rather than a second
-- warning.
--
-- No authenticated write policy: the worker runs as the service role. Reads
-- are denied to authenticated users entirely — this is internal machinery, not
-- product surface.
-- ============================================================================

create table if not exists operational_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  -- The organization-local day the job belongs to.
  business_date date not null,
  -- Null for organization-level jobs (open day, close day, carryover).
  rep_id uuid references reps(id) on delete cascade,

  job_kind text not null check (job_kind in (
    'OPEN_DAY',
    'EVALUATE_REP_DAY',
    'EMIT_WARNING',
    'EMIT_ESCALATION',
    'CLOSE_MISSED_DAY',
    'PREPARE_CARRYOVER',
    'EVALUATE_FOLLOWUP',
    'ENQUEUE_EMAIL'
  )),

  -- The warning stage or hour bucket this job represents. Part of the key so
  -- "at 15:00" and "at 17:30" are different jobs, while a retry of either is
  -- the same job.
  time_bucket text not null default 'default',

  -- Deterministic identity: organization + date + rep + kind + bucket.
  dedupe_key text not null,

  state text not null default 'pending'
    check (state in ('pending', 'running', 'done', 'dead')),

  attempt int not null default 0 check (attempt >= 0),
  max_attempts int not null default 5 check (max_attempts > 0),
  last_error text,
  next_attempt_at timestamptz not null default now(),

  -- Trace correlation for observability.
  request_id text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,

  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, dedupe_key)
);

-- The worker's only hot query: due work, oldest first.
create index if not exists oj_due_idx
  on operational_jobs (next_attempt_at)
  where state = 'pending';

create index if not exists oj_org_date_idx
  on operational_jobs (organization_id, business_date desc);

create index if not exists oj_state_idx
  on operational_jobs (state, next_attempt_at);

alter table operational_jobs enable row level security;
-- Intentionally no policies: authenticated users cannot read or write the
-- scheduler. The service role bypasses RLS.

comment on table operational_jobs is
  'Durable operational outbox. Idempotent by (organization_id, dedupe_key); retried with backoff; dead-lettered after max_attempts.';

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   -- Idempotency: the same key twice must produce one row.
--   select organization_id, dedupe_key, count(*)
--   from operational_jobs group by 1, 2 having count(*) > 1;   -- zero rows
--
--   -- Dead letters must be visible, never silent.
--   select job_kind, state, attempt, last_error
--   from operational_jobs where state = 'dead';
-- ---------------------------------------------------------------------------
