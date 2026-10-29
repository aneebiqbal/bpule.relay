-- =============================================================================
-- UPWORK SENDER ATTRIBUTION (BUG-29)
--
-- The Upwork flow never persisted which profile a proposal was written for.
-- `createUpworkJob` has no profile column, `upwork_messages` has no profile
-- column, and the generate route takes `profileId` from the request body without
-- storing it — so every UPWORK_APPLIED / UPWORK_PROPOSAL_PREPARED action_events
-- row was written with sender_profile_id = NULL and no surface could resolve
-- "Performed for profile: <profile>".
--
-- The application code already writes these columns when they exist and degrades
-- to NULL when they do not, so this migration is additive and safe to apply at
-- any time. It cannot be applied from this environment (no SUPABASE_DB_PASSWORD,
-- management token unavailable) — run it when database access is restored.
-- =============================================================================

alter table upwork_jobs
  add column if not exists sender_profile_id uuid references profiles(id) on delete set null;

-- `connects_used` was written by markUpworkApplied() from code commit 3d0a4b4
-- without a migration, so the update 400'd in production and `status` never
-- flipped to 'applied' while the route still returned 200 (BUG-28). The
-- application now writes it only when the column is present; this records the
-- intended schema.
alter table upwork_jobs
  add column if not exists connects_used integer;

alter table upwork_messages
  add column if not exists sender_profile_id uuid references profiles(id) on delete set null;

create index if not exists upwork_jobs_sender_profile_idx on upwork_jobs (sender_profile_id);
create index if not exists upwork_messages_sender_profile_idx on upwork_messages (sender_profile_id);

comment on column upwork_jobs.sender_profile_id is
  'The profile this job''s proposal is written for. Attribution only — it never changes the job''s owner.';
comment on column upwork_messages.sender_profile_id is
  'The profile this proposal was sent as. Resolved to a display name by the action ledger.';
