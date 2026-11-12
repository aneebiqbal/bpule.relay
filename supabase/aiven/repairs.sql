-- ============================================================================
-- Aiven build repairs.
--
-- Columns the migration chain expects but the consolidated catch-up predates
-- (added out-of-band on Neon). Applied after the catch-up and before the
-- numbered chain. All idempotent.
-- ============================================================================

-- upwork_applications: the V5.1 canonical shape (the contract migration drops
-- the legacy columns; the backfill and submit RPC use these).
alter table upwork_applications add column if not exists rep_id uuid references reps(id) on delete set null;
alter table upwork_applications add column if not exists person_profile_id uuid references profiles(id) on delete set null;
alter table upwork_applications add column if not exists revenue_identity_id uuid references revenue_identities(id) on delete set null;
alter table upwork_applications add column if not exists submitted_at timestamptz;
alter table upwork_applications add column if not exists proposal_text text;
alter table upwork_applications add column if not exists proposal_version_id uuid;
alter table upwork_applications add column if not exists connects_spent integer;
alter table upwork_applications add column if not exists boost_connects integer;
alter table upwork_applications add column if not exists screening_answers jsonb default '[]'::jsonb;

-- relay_runs: sender attribution for the V6.3 attribution backfill.
alter table relay_runs add column if not exists sender_profile_id uuid references profiles(id) on delete set null;
