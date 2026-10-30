-- ============================================================================
-- RELAY FOUNDATION VERIFY
--
-- Run AFTER RELAY_FOUNDATION_APPLY.sql, in the Supabase SQL Editor.
-- Every row returns PASS or FAIL. Paste the whole result back.
--
-- Read-only. This file changes nothing.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables exist
-- ---------------------------------------------------------------------------
select 'table: ' || t as check,
       case when to_regclass('public.' || t) is not null then 'PASS' else 'FAIL' end as result
from unnest(array[
  'organization_operating_policy',
  'organization_day',
  'rep_day',
  'operational_jobs'
]) as t;

-- ---------------------------------------------------------------------------
-- 2. RLS enabled on every new table
-- ---------------------------------------------------------------------------
select 'rls: ' || c.relname as check,
       case when c.relrowsecurity then 'PASS' else 'FAIL' end as result
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('organization_operating_policy','organization_day','rep_day','operational_jobs')
order by c.relname;

-- ---------------------------------------------------------------------------
-- 3. Unique keys (the dedupe guarantees)
-- ---------------------------------------------------------------------------
select 'unique: organization_day(org, business_date)' as check,
       case when exists (
         select 1 from pg_constraint
         where conrelid = 'public.organization_day'::regclass and contype = 'u'
       ) then 'PASS' else 'FAIL' end as result
union all
select 'unique: rep_day(org, rep, business_date)',
       case when exists (
         select 1 from pg_constraint
         where conrelid = 'public.rep_day'::regclass and contype = 'u'
       ) then 'PASS' else 'FAIL' end
union all
select 'unique: operational_jobs(org, dedupe_key)',
       case when exists (
         select 1 from pg_constraint
         where conrelid = 'public.operational_jobs'::regclass and contype = 'u'
       ) then 'PASS' else 'FAIL' end;

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------
select 'index: ' || i as check,
       case when to_regclass('public.' || i) is not null then 'PASS' else 'FAIL' end as result
from unnest(array[
  'od_org_date_idx','oj_due_idx','oj_org_date_idx','oj_state_idx',
  'rd_org_date_idx','rd_org_state_idx','rd_rep_date_idx'
]) as i;

-- ---------------------------------------------------------------------------
-- 5. Default bpulse policy
--    Expected: Asia/Karachi · 09:00–18:00 · Mon–Fri · reset 00:00
-- ---------------------------------------------------------------------------
select 'policy row exists' as check,
       case when exists (
         select 1 from organization_operating_policy
         where organization_id = '11111111-1111-1111-1111-111111111111'
       ) then 'PASS' else 'FAIL' end as result
union all
select 'policy timezone = Asia/Karachi',
       case when exists (
         select 1 from organization_operating_policy
         where organization_id = '11111111-1111-1111-1111-111111111111'
           and timezone = 'Asia/Karachi'
       ) then 'PASS' else 'FAIL' end
union all
select 'policy hours 09:00-18:00',
       case when exists (
         select 1 from organization_operating_policy
         where organization_id = '11111111-1111-1111-1111-111111111111'
           and workday_start = '09:00' and workday_end = '18:00'
       ) then 'PASS' else 'FAIL' end
union all
select 'policy working days Mon-Fri',
       case when exists (
         select 1 from organization_operating_policy
         where organization_id = '11111111-1111-1111-1111-111111111111'
           and working_days = '{1,2,3,4,5}'::int[]
       ) then 'PASS' else 'FAIL' end
union all
select 'policy reset 00:00',
       case when exists (
         select 1 from organization_operating_policy
         where organization_id = '11111111-1111-1111-1111-111111111111'
           and daily_reset_time = '00:00'
       ) then 'PASS' else 'FAIL' end;

-- ---------------------------------------------------------------------------
-- 6. Every organization has a policy (no org left without a clock)
-- ---------------------------------------------------------------------------
select 'every organization has a policy' as check,
       case when not exists (
         select 1 from organizations o
         where not exists (
           select 1 from organization_operating_policy p where p.organization_id = o.id
         )
       ) then 'PASS' else 'FAIL' end as result;

-- ---------------------------------------------------------------------------
-- 7. Cutover date is set (historical accountability is never reinterpreted)
-- ---------------------------------------------------------------------------
select 'cutover_date present on every policy' as check,
       case when not exists (
         select 1 from organization_operating_policy where cutover_date is null
       ) then 'PASS' else 'FAIL' end as result;

-- ---------------------------------------------------------------------------
-- 8. Shape of what was created (paste this too — it is the audit trail)
-- ---------------------------------------------------------------------------
select organization_id, timezone, workday_start, workday_end,
       working_days, daily_reset_time, cutover_date, created_at
from organization_operating_policy
order by organization_id;
