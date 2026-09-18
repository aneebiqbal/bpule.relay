-- 0094: Fix revenue_identities schema + daily_targets integrity
--
-- 1. revenue_identities: profile_url and channel columns were never created
--    in the original 0081 migration. Code references them → 500 on POST/PATCH.
-- 2. daily_targets: ensure rep_id is NOT NULL (broken 0088 schema had it nullable).

-- === revenue_identities ===

-- Add profile_url column
alter table if exists revenue_identities
  add column if not exists profile_url text;

-- Add channel column with constraint
alter table if exists revenue_identities
  add column if not exists channel text not null default 'other' check (channel in ('linkedin', 'upwork', 'other'));

-- Add profile_url index
create index if not exists revenue_identities_profile_url_idx on revenue_identities(profile_url);

-- === daily_targets ===

-- Ensure rep_id is NOT NULL (0088 created it nullable by mistake)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'daily_targets'
             and column_name = 'rep_id' and is_nullable = 'YES') then
    update daily_targets set rep_id = (select id from reps where organization_id = daily_targets.organization_id limit 1) where rep_id is null;
    alter table daily_targets alter column rep_id set not null;
  end if;
end $$;

-- Ensure revenue_identity_id is NOT NULL
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'daily_targets'
             and column_name = 'revenue_identity_id' and is_nullable = 'YES') then
    delete from daily_targets where revenue_identity_id is null;
    alter table daily_targets alter column revenue_identity_id set not null;
  end if;
end $$;

-- Add missing columns
alter table if exists daily_targets
  add column if not exists updated_at timestamptz not null default now();

-- Fix the unique constraint if missing
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
