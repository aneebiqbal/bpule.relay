-- Work Setup computes an account revision from identity_assignments.updated_at
-- (computeAccountRevision and loadWorkSetup), but 0081 created that table with
-- only created_at. Any database where an assignment exists therefore failed
-- GET /api/admin/work-setup with a 500. Add the column the canonical writer
-- already assumes, backfilled to the existing created_at.
alter table identity_assignments add column if not exists updated_at timestamptz;
update identity_assignments set updated_at = created_at where updated_at is null;
alter table identity_assignments alter column updated_at set not null;
alter table identity_assignments alter column updated_at set default now();

create index if not exists identity_assignments_org_updated_idx
  on identity_assignments (organization_id, updated_at desc);
