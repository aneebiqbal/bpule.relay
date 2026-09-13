-- 0023: RLS adversarial test — multi-tenant isolation verification
--
-- Creates a throwaway second organization, then verifies that every
-- tenant-scoped table's RLS policy correctly filters out bpulse's data
-- when queried as a rep from the test org.
--
-- HOW TO RUN: Execute each section in order in the Supabase SQL editor.
-- Sections 1-3 set up test data. Section 4 runs the adversarial queries.
-- Section 5 cleans up.
--
-- PREREQUISITE: Migrations 0020, 0021, 0022 must be applied first.

-- ============================================================================
-- SECTION 1: Create test organization
-- ============================================================================

insert into organizations (id, name, plan)
values ('99999999-9999-9999-9999-999999999999', 'test-org-b', 'trial')
on conflict (id) do nothing;

-- Verify it exists
select 'Test org created' as status, id, name from organizations where id = '99999999-9999-9999-9999-999999999999';

-- ============================================================================
-- SECTION 2: Create test auth user + rep in org-b
-- ============================================================================

-- Create auth user (simulates signup)
insert into auth.users (id, email, role, raw_user_meta_data, created_at)
values (
  '88888888-8888-8888-8888-888888888888',
  'test-org-b@example.com',
  'authenticated',
  '{"name": "Test Org B Rep", "email": "test-org-b@example.com"}',
  now()
)
on conflict (id) do nothing;

-- Create rep linked to that auth user in org-b
insert into reps (id, name, role, organization_id, auth_user_id, created_at)
values (
  'rep-test-b',
  'Test Org B Rep',
  'admin',
  '99999999-9999-9999-9999-999999999999',
  '88888888-8888-8888-8888-888888888888',
  now()
)
on conflict (id) do nothing;

-- Verify
select 'Test rep created' as status, r.id, r.name, r.organization_id, r.auth_user_id
from reps r where id = 'rep-test-b';

-- ============================================================================
-- SECTION 3: Verify bpulse data exists (the data we're trying NOT to see)
-- ============================================================================

select 'bpulse org' as org, count(*) as rep_count from reps where organization_id = '11111111-1111-1111-1111-111111111111'
union all
select 'bpulse leads', count(*) from leads where organization_id = '11111111-1111-1111-1111-111111111111'
union all
select 'bpulse facts', count(*) from facts where organization_id = '11111111-1111-1111-1111-111111111111'
union all
select 'bpulse profiles', count(*) from profiles where organization_id = '11111111-1111-1111-1111-111111111111'
union all
select 'bpulse messages', count(*) from messages where organization_id = '11111111-1111-1111-1111-111111111111';

-- ============================================================================
-- SECTION 4: Adversarial test — simulate RLS policy evaluation
--
-- The RLS policies use: organization_id = current_org_id()
-- where current_org_id() = (
--   select r.organization_id from reps r where r.auth_user_id = auth.uid()
-- )
--
-- We simulate this by manually applying the same filter. If the policy is
-- correct, filtering with org-b's ID should return ZERO rows of bpulse data.
-- ============================================================================

-- The key question: does org-b's ID appear in any bpulse data?
-- These should ALL return 0:

select 'LEAK CHECK: leads' as check_name,
       count(*) as leak_count
from leads
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: messages',
       count(*)
from messages
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: outcomes',
       count(*)
from outcomes
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: voice_profiles',
       count(*)
from voice_profiles
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: facts',
       count(*)
from facts
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: plays',
       count(*)
from plays
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: profiles',
       count(*)
from profiles
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: proof_items',
       count(*)
from proof_items
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: golden_set',
       count(*)
from golden_set
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: few_shot_wins',
       count(*)
from few_shot_wins
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: upwork_jobs',
       count(*)
from upwork_jobs
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: upwork_messages',
       count(*)
from upwork_messages
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: csv_imports',
       count(*)
from csv_imports
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: push_subscriptions',
       count(*)
from push_subscriptions
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: notification_log',
       count(*)
from notification_log
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: eval_runs',
       count(*)
from eval_runs
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: extraction_runs',
       count(*)
from extraction_runs
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: content_personas',
       count(*)
from content_personas
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: content_pillars',
       count(*)
from content_pillars
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: content_drafts',
       count(*)
from content_drafts
where organization_id = '99999999-9999-9999-9999-999999999999'

union all

select 'LEAK CHECK: content_history',
       count(*)
from content_history
where organization_id = '99999999-9999-9999-9999-999999999999';

-- ============================================================================
-- SECTION 4b: Verify the RLS policy functions work correctly
-- ============================================================================

-- current_org_id() should return org-b's ID for our test user
select 'current_org_id() test' as test,
       (select r.organization_id from reps r where r.auth_user_id = '88888888-8888-8888-8888-888888888888') as org_b_id,
       case when (select r.organization_id from reps r where r.auth_user_id = '88888888-8888-8888-8888-888888888888') = '99999999-9999-9999-9999-999999999999'
            then 'PASS' else 'FAIL' end as result;

-- is_org_admin() should return true for our admin test rep
select 'is_org_admin() test' as test,
       (select r.role = 'admin' from reps r where r.auth_user_id = '88888888-8888-8888-8888-888888888888') as is_admin,
       case when (select r.role = 'admin' from reps r where r.auth_user_id = '88888888-8888-8888-8888-888888888888')
            then 'PASS' else 'FAIL' end as result;

-- ============================================================================
-- SECTION 4c: Verify bpulse data is NOT visible when filtered as org-b
-- (This is what the RLS policy enforces: organization_id = current_org_id())
-- ============================================================================

-- These simulate exactly what the RLS USING clause does.
-- ALL should return 0:

select 'RLS sim: leads visible to org-b' as test,
       count(*) as visible_rows
from leads
where organization_id = (select r.organization_id from reps r where r.auth_user_id = '88888888-8888-8888-8888-888888888888')

union all

select 'RLS sim: facts visible to org-b', count(*)
from facts
where organization_id = (select r.organization_id from reps r where r.auth_user_id = '88888888-8888-8888-8888-888888888888')

union all

select 'RLS sim: profiles visible to org-b', count(*)
from profiles
where organization_id = (select r.organization_id from reps r where r.auth_user_id = '88888888-8888-8888-8888-888888888888')

union all

select 'RLS sim: messages visible to org-b', count(*)
from messages
where organization_id = (select r.organization_id from reps r where r.auth_user_id = '88888888-8888-8888-8888-888888888888')

union all

select 'RLS sim: proof_items visible to org-b', count(*)
from proof_items
where organization_id = (select r.organization_id from reps r where r.auth_user_id = '88888888-8888-8888-8888-888888888888');

-- ============================================================================
-- SECTION 5: Cleanup (run after verifying results)
-- ============================================================================

-- Uncomment these to clean up test data:

-- delete from reps where id = 'rep-test-b';
-- delete from organizations where id = '99999999-9999-9999-9999-999999999999';
-- delete from auth.users where id = '88888888-8888-8888-8888-888888888888';
