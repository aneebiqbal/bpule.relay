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
