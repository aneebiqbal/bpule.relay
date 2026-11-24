-- HAND-RUN HELPER — not part of the numbered migration pipeline.
--
-- Adds identity_assignments.updated_at. The canonical readers use created_at
-- (work-setup.ts / work-setup-write.ts) because assignments are deleted and
-- re-inserted rather than updated, so the two clocks are the same. This file is
-- kept for an operator who wants the column anyway; it cannot run in the deploy
-- pipeline because every table in this database is owned by the Aiven `avnadmin`
-- role while the deploy connects as `relay_service`, and ALTER TABLE requires
-- ownership. Run it once as avnadmin if the column is wanted:
--
--   SERVICE_DATABASE_URL=<avnadmin url> scripts/apply-pending-migrations.sh
--
-- (0081 created identity_assignments with only created_at.)
alter table identity_assignments add column if not exists updated_at timestamptz;
update identity_assignments set updated_at = created_at where updated_at is null;
alter table identity_assignments alter column updated_at set not null;
alter table identity_assignments alter column updated_at set default now();

create index if not exists identity_assignments_org_updated_idx
  on identity_assignments (organization_id, updated_at desc);
