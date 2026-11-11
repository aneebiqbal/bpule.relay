-- RELAY V6.1 — The daily plan belongs to the CHANNEL, not the operator.
--
-- Before: daily_targets was keyed (rep_id, revenue_identity_id, activity_type),
-- so a shared profile conceptually required N × target and two operators looked
-- like two separate plans.
--
-- After: one plan per (identity, activity), effective-dated. Reps CONTRIBUTE
-- toward it; daily_accountability already records who contributed what and is
-- left untouched as contribution truth.
--
-- Migration analysis (§9), production, run before this file:
--   active daily_targets rows:            30
--   duplicate (identity, activity) lanes:  2  (Aneeb · upwork application and
--                                              proposal: a STALE Ahmad lane plus
--                                              the PRIMARY Dawood lane, equal targets)
--   ambiguous rows:                       0
--   activity types: application 7, connection_request 4, dm 4,
--                    followup 4, proposal 7, prospect_extracted 4
-- So the backfill is one plan per unique lane. Nothing is merged or discarded;
-- when a lane is duplicated, the PRIMARY's row wins deterministically.
--
-- `proposal` lanes are carried across with targetable = false: generating a
-- draft is real work but is NOT a submitted application, so it is tracked and
-- shown, never part of the requirement.

create table if not exists daily_target_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  activity_type text not null,
  target_count int not null check (target_count > 0),
  -- Registry-driven. Non-targetable lanes are tracked, never a requirement.
  targetable boolean not null default true,
  effective_from date not null default current_date,
  effective_until date,
  active boolean not null default true,
  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active requirement per lane. History rows are inactive and stay queryable.
create unique index if not exists dtp_active_lane_uniq
  on daily_target_plans (organization_id, revenue_identity_id, activity_type)
  where active;

create index if not exists dtp_identity_idx on daily_target_plans (revenue_identity_id);
create index if not exists dtp_org_active_idx on daily_target_plans (organization_id, active);
create index if not exists dtp_org_effective_idx on daily_target_plans (organization_id, effective_from);

alter table daily_target_plans enable row level security;

drop policy if exists "dtp_select" on daily_target_plans;
create policy "dtp_select" on daily_target_plans
  for select to authenticated using (
    organization_id = current_org_id()
    and (
      is_org_admin()
      or exists (
        select 1 from profile_coverage pc
        join revenue_identities ri on ri.profile_id = pc.profile_id
        where ri.id = daily_target_plans.revenue_identity_id
          and pc.rep_id = current_rep_id()
          and pc.active
      )
    )
  );

drop policy if exists "dtp_insert" on daily_target_plans;
create policy "dtp_insert" on daily_target_plans
  for insert to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "dtp_update" on daily_target_plans;
create policy "dtp_update" on daily_target_plans
  for update to authenticated
  using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "dtp_delete" on daily_target_plans;
create policy "dtp_delete" on daily_target_plans
  for delete to authenticated using (organization_id = current_org_id() and is_org_admin());

comment on table daily_target_plans is
  'One daily requirement per channel identity and activity. Operators contribute toward it (daily_accountability); they never own it. Effective-dated so a change never rewrites yesterday.';

-- Backfill: one plan per unique active lane, preserving who created it. When a
-- lane is duplicated (two operators carrying the same target), the PRIMARY's
-- row wins so the plan's provenance is the canonical owner.
insert into daily_target_plans (
  organization_id, revenue_identity_id, activity_type, target_count, targetable,
  effective_from, active, created_by, created_at, updated_at
)
select distinct on (dt.organization_id, dt.revenue_identity_id, dt.activity_type)
  dt.organization_id,
  dt.revenue_identity_id,
  dt.activity_type,
  dt.target_count,
  case when dt.activity_type = 'proposal' then false else true end,
  current_date,
  true,
  dt.created_by,
  dt.created_at,
  dt.updated_at
from daily_targets dt
left join revenue_identities ri on ri.id = dt.revenue_identity_id
left join profile_coverage pc
  on pc.profile_id = ri.profile_id
 and pc.rep_id = dt.rep_id
 and pc.active
 and pc.role = 'PRIMARY'
where dt.active
order by
  dt.organization_id,
  dt.revenue_identity_id,
  dt.activity_type,
  case when pc.rep_id is null then 1 else 0 end,
  dt.created_at;
