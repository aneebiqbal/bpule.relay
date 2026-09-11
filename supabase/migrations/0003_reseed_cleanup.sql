-- Reseed cleanup: drop the old demo auth users and demo reps (from 0001) that
-- were seeded by raw SQL and break GoTrue sign-in on the hosted platform, plus
-- their FAKE dependents. Runs as a no-op on a fresh database where Auth is
-- platform-managed and dev users are created via scripts/seed-dev-users.mjs.

drop function if exists public.debug_auth_issue();

-- Demo reps and their FAKE dependents. Owner/message/outcome rows first so the
-- FK chains clear in order, and before the auth users they reference.
delete from messages where rep_id in (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000003'
);
delete from outcomes where lead_id in (
  select id from leads where owner_rep_id in (
    'bbbbbbbb-0000-0000-0000-000000000001',
    'bbbbbbbb-0000-0000-0000-000000000002',
    'bbbbbbbb-0000-0000-0000-000000000003'
  )
);
delete from leads where owner_rep_id in (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000003'
);
delete from voice_profiles where rep_id in (
  'bbbbbbbb-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000003'
);
update facts set added_by = null where added_by in (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000003'
);
delete from reps where id in (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000003'
);

-- Broken raw-SQL auth users (their presence makes GoTrue queries fail).
delete from auth.identities
where user_id in (
  select id from auth.users where email in
    ('hassan@scout.dev', 'ahmed@scout.dev', 'nadia@scout.dev')
);
delete from auth.users
where email in ('hassan@scout.dev', 'ahmed@scout.dev', 'nadia@scout.dev');