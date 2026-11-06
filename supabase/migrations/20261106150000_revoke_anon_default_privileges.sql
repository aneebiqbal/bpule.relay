-- ============================================================================
-- Close the anonymous-key default grants.
--
-- Supabase/Neon installs a default ACL that grants `anon` ALL on every table
-- created in `public` (and SELECT/INSERT/UPDATE/DELETE via the table ACL).
-- Individual migrations that `revoke all ... from anon` on one table are undone
-- for every table created afterwards, so production still had `anon=arwd` on
-- 516 tables. Row level security is the intended control for authenticated
-- users, but the anonymous key must hold no privileges at all.
--
-- 1. Stop the default grants for tables and sequences created by the owner.
-- 2. Revoke the grants already present on existing tables and sequences.
--
-- Nothing in the app reads or writes `public` with the anon key: the server
-- uses the signed-in user's session (Neon `app.current_user_id`) or the service
-- role, and the public pages are static.
-- ============================================================================

alter default privileges for role neondb_owner in schema public
  revoke all on tables from anon;

alter default privileges for role neondb_owner in schema public
  revoke all on sequences from anon;

revoke all on all tables in schema public from anon;

revoke all on all sequences in schema public from anon;

-- The Neon Auth mapping table lives in public, has no RLS, and holds email
-- addresses and user ids. It is internal to the auth provider, so no
-- application role may touch it directly.
revoke all on table auth_user_mapping from anon;
revoke all on table auth_user_mapping from authenticated;
revoke all on table auth_user_mapping from relay_app;

comment on table auth_user_mapping is
  'Neon Auth internal mapping. No application-role access; the auth provider uses the service role.';

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   select count(*) from information_schema.role_table_grants
--   where table_schema='public' and grantee='anon';   -- expect 0
--
--   select defaclacl from pg_default_acl
--   where defaclnamespace = 'public'::regnamespace;   -- no anon entry
-- ---------------------------------------------------------------------------
