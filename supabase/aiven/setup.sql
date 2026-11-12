-- ============================================================================
-- Aiven test-database setup orchestration (run via psql, not a migration).
--
-- The Relay migration chain has pre-existing demo-seed bugs and depends on the
-- consolidated catch-up file for some columns. This script builds the schema in
-- the order Neon actually had it:
--
--   bootstrap -> base migrations (tolerant) -> catch-up -> loose files -> chain
--
-- It is idempotent: it drops and rebuilds the application schemas.
-- ============================================================================

\timing off

-- 1. Reset the application schemas (roles are preserved).
drop schema if exists public cascade;
drop schema if exists auth cascade;
drop schema if exists storage cascade;
drop schema if exists extensions cascade;
drop schema if exists supabase_migrations cascade;

-- 2. Compatibility bootstrap.
\i supabase/aiven/bootstrap.sql

-- 3. Base migrations (0001 - 20261003). Tolerant: demo seeds and a few
--    pre-existing bugs are repaired by the catch-up below.
