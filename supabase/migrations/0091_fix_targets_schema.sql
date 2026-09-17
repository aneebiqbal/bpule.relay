-- 0091: Fix daily_targets and daily_accountability schema if 0088 was already applied
--
-- 0088_fix_missing_tables.sql may have created daily_targets with an incompatible
-- schema (nullable rep_id, missing activity_type/target_count, no unique constraint).
-- This migration reconciles the live schema with the canonical 0085/0091 definition.
-- Safe to run multiple times.

-- ============================================================================
-- DAILY TARGETS — canonical schema
-- ============================================================================

-- Drop the broken table if it has the wrong schema, then recreate canonically.
-- We detect "wrong schema" by checking for the absence of activity_type.
do $$
begin
  -- If table exists but lacks activity_type column, it's the broken 0088 version.
  -- Drop it and recreate correctly.
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'daily_targets')
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'daily_targets' and column_name = 'activity_type') then
    drop table if exists daily_targets cascade;
  end if;
end $$;

-- Create canonical schema (only if it doesn't already exist with correct shape)
create table if not exists daily_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  activity_type text not null,
  target_count int not null check (target_count > 0),
  active boolean not null default true,
  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rep_id, revenue_identity_id, activity_type)
);

-- Add columns if they are missing (in case table exists but is missing some)
alter table daily_targets add column if not exists created_by uuid references reps(id) on delete set null;
alter table daily_targets alter column active set default true;
alter table daily_targets alter column created_at set default now();
alter table daily_targets alter column updated_at set default now();

-- Ensure unique constraint exists
do $$
begin
  if not exists (select 1 from information_schema.table_constraints
                 where table_schema = 'public' and table_name = 'daily_targets'
                 and constraint_name = 'daily_targets_rep_id_revenue_identity_id_activity_type_key') then
    alter table daily_targets
      add constraint daily_targets_rep_id_revenue_identity_id_activity_type_key
      unique (rep_id, revenue_identity_id, activity_type);
  end if;
end $$;

-- Indexes
create index if not exists dt_org_idx on daily_targets(organization_id);
create index if not exists dt_rep_idx on daily_targets(rep_id);
create index if not exists dt_identity_idx on daily_targets(revenue_identity_id);

-- RLS
alter table daily_targets enable row level security;

drop policy if exists "dt_select" on daily_targets;
create policy "dt_select" on daily_targets
  for select to authenticated using (organization_id = current_org_id());

drop policy if exists "dt_insert" on daily_targets;
create policy "dt_insert" on daily_targets
  for insert to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "dt_update" on daily_targets;
create policy "dt_update" on daily_targets
  for update to authenticated
  using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "dt_delete" on daily_targets;
create policy "dt_delete" on daily_targets
  for delete to authenticated
  using (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- DAILY ACCOUNTABILITY — canonical schema
-- ============================================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'daily_accountability')
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'daily_accountability' and column_name = 'activity_type') then
    drop table if exists daily_accountability cascade;
  end if;
end $$;

create table if not exists daily_accountability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  activity_type text not null,
  target_date date not null,
  target_count int not null default 0,
  completed_count int not null default 0,
  status text not null default 'on_track' check (status in ('on_track', 'at_risk', 'completed', 'missed')),
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rep_id, revenue_identity_id, activity_type, target_date)
);

-- Add missing columns if they don't exist
alter table daily_accountability add column if not exists revenue_identity_id uuid references revenue_identities(id) on delete cascade;
alter table daily_accountability add column if not exists activity_type text not null default 'dm';
alter table daily_accountability add column if not exists target_date date not null default current_date;
alter table daily_accountability add column if not exists target_count int not null default 0;
alter table daily_accountability add column if not exists completed_count int not null default 0;
alter table daily_accountability add column if not exists status text not null default 'on_track';
alter table daily_accountability add column if not exists closed boolean not null default false;

-- Ensure unique constraint exists
do $$
begin
  if not exists (select 1 from information_schema.table_constraints
                 where table_schema = 'public' and table_name = 'daily_accountability'
                 and constraint_name = 'daily_accountability_rep_id_revenue_identity_id_activi_key') then
    alter table daily_accountability
      add constraint daily_accountability_rep_id_revenue_identity_id_activi_key
      unique (rep_id, revenue_identity_id, activity_type, target_date);
  end if;
end $$;

-- Indexes
create index if not exists da_org_idx on daily_accountability(organization_id);
create index if not exists da_rep_idx on daily_accountability(rep_id);
create index if not exists da_date_idx on daily_accountability(target_date);

-- RLS
alter table daily_accountability enable row level security;

drop policy if exists "da_select" on daily_accountability;
create policy "da_select" on daily_accountability
  for select to authenticated using (organization_id = current_org_id());

drop policy if exists "da_insert" on daily_accountability;
create policy "da_insert" on daily_accountability
  for insert to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "da_update" on daily_accountability;
create policy "da_update" on daily_accountability
  for update to authenticated
  using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- MISSING FROM 0085: Helper + trigger + RPC functions
-- These were defined in 0085 but never applied to the live DB.
-- ============================================================================

create or replace function public.is_org_working_day(
  p_org_id uuid,
  p_date date
) returns boolean
language sql stable security definer set search_path = public as
$$
  select
    coalesce(
      (
        select extract(dow from p_date)::int = any(o.working_days)
        from organizations o
        where o.id = p_org_id
      ),
      false
    )
    and not exists (
      select 1
      from organizations o,
      jsonb_array_elements(o.holidays) h
      where o.id = p_org_id
        and (h->>'date')::date = p_date
    );
$$;

create or replace function public.ensure_daily_accountability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
begin
  v_date := current_date;
  if public.is_org_working_day(NEW.organization_id, v_date) then
    insert into daily_accountability (
      organization_id, rep_id, revenue_identity_id, activity_type,
      target_date, target_count, completed_count, status, closed
    ) values (
      NEW.organization_id, NEW.rep_id, NEW.revenue_identity_id, NEW.activity_type,
      v_date, NEW.target_count, 0, 'on_track', false
    )
    on conflict (rep_id, revenue_identity_id, activity_type, target_date)
    do update set
      target_count = NEW.target_count,
      updated_at = now()
    where daily_accountability.closed = false;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_ensure_daily_accountability on daily_targets;
create trigger trg_ensure_daily_accountability
  after insert or update on daily_targets
  for each row
  when (NEW.active = true)
  execute function public.ensure_daily_accountability();

create or replace function public.record_activity_event(
  p_rep_id uuid,
  p_identity_id uuid,
  p_activity_type text,
  p_org_id uuid
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
begin
  v_date := current_date;
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
    target_date, target_count, completed_count, status, closed
  ) values (
    p_org_id, p_rep_id, p_identity_id, p_activity_type,
    v_date, v_target_count, 1, 'on_track', false
  )
  on conflict (rep_id, revenue_identity_id, activity_type, target_date)
  do update set
    completed_count = daily_accountability.completed_count + 1,
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
