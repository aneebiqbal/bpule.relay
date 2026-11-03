-- 20261104000000 — Neon schema catch-up (applied by hand 2026-11-04).
--
-- The Neon database was created from a schema dump and had no
-- supabase_migrations history, so 103 pending migrations were applied on
-- 2026-11-04. Three tables still did not match the application contract
-- because the migrations that should have shaped them pre-date the dump and
-- used `create table if not exists` (which is a no-op on an existing table).
--
-- This migration adds exactly what the code writes. All statements are
-- additive or a pure rename; no column is dropped and no row is modified.

-- 1. accountability_audit_log
--    0085 created the canonical shape but the live table kept the legacy one
--    (actor_id / action / target_table / target_id / previous_value /
--    new_value). Every writer uses rep_id / revenue_identity_id / event_type /
--    detail, so those columns are added and backfilled.
alter table accountability_audit_log add column if not exists rep_id uuid references reps(id) on delete set null;
alter table accountability_audit_log add column if not exists revenue_identity_id uuid references revenue_identities(id) on delete set null;
alter table accountability_audit_log add column if not exists event_type text;
alter table accountability_audit_log add column if not exists detail jsonb not null default '{}'::jsonb;
update accountability_audit_log set event_type = 'legacy' where event_type is null;
alter table accountability_audit_log alter column event_type set not null;

-- 2. eval_runs
--    The code reads self_check_pass_rate; the column shipped as
--    selfcheck_pass_rate (no underscore). Rename only when needed.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'eval_runs' and column_name = 'selfcheck_pass_rate')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'eval_runs' and column_name = 'self_check_pass_rate') then
    execute 'alter table eval_runs rename column selfcheck_pass_rate to self_check_pass_rate';
  end if;
end $$;

-- 3. content_drafts
--    tryMarkContentDraftPosted() writes posted_at.
alter table content_drafts add column if not exists posted_at timestamptz;

-- NOTE: 0042_fix_security_definer_rls.sql is also corrected here (its
-- match_proofs_by_embedding declared `set search_path = public`, which hides
-- the pgvector `<=>` operator that lives in the `extensions` schema). Apply
-- that file with `extensions` on the search path.
