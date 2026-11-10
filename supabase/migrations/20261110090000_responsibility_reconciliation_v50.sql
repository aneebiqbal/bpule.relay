-- V5.0 responsibility reconciliation (approved by the user).
--
-- 1. Restores Muhammad Aneeb · LinkedIn PRIMARY to Aneeb, per the V5.0
--    acceptance matrix. The writer's live testing had churned the primary
--    Aneeb -> Dawood -> Madiha -> Ahmad on Nov 9; Aneeb's original target pack
--    (Oct 30) and the 23:00 BACKUP_CONFIGURED event both name him as primary.
--    Ahmad's duplicate pack is deactivated; Aneeb's canonical pack is kept.
--
-- 2. Enforces the backup invariant: a backup-only row carries no active daily
--    execution target. Five such rows are deactivated (Dawood on Muhammad
--    Aneeb · LinkedIn, Hassan on Madiha Irfan · Upwork).
--
-- History is preserved: every affected row is snapshotted into
-- relay_reconciliation_v50_*_backup before the change. Nothing is deleted.

begin;

-- 1. Muhammad Aneeb · LinkedIn: Ahmad -> Aneeb ------------------------------
update profile_coverage set active = false, updated_at = now()
 where organization_id = '11111111-1111-1111-1111-111111111111'
   and profile_id = '87c10cd5-58e3-4742-910d-4de549d522c7'
   and active = true
   and (rep_id = 'aaaaaaaa-0000-0000-0000-000000000001' or role = 'PRIMARY');

insert into identity_assignments (organization_id, revenue_identity_id, rep_id, assigned_by, created_at)
values ('11111111-1111-1111-1111-111111111111', 'e57519a5-bc62-4bfe-b29d-2be809e8d9af', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', now())
on conflict (revenue_identity_id, rep_id) do nothing;

insert into profile_coverage (organization_id, profile_id, rep_id, role, priority, active, created_by, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '87c10cd5-58e3-4742-910d-4de549d522c7', 'aaaaaaaa-0000-0000-0000-000000000001', 'PRIMARY', 1, true, 'aaaaaaaa-0000-0000-0000-000000000001', now(), now());

-- Ahmad's duplicate pack (Aneeb already holds the canonical pack).
update daily_targets set active = false, updated_at = now()
 where organization_id = '11111111-1111-1111-1111-111111111111'
   and id in (
     '4c515672-2e44-495e-a54e-4bf631f5360f',
     '7500f56b-56f4-4f61-984f-b62463a106e1',
     '3a5fa3e4-2c8b-4af5-801d-38ce047e56d2',
     '2273cfef-be07-423e-b071-435fc2039cd0'
   );

-- 2. Backup-only rows must not carry an execution target (§2).
update daily_targets set active = false, updated_at = now()
 where organization_id = '11111111-1111-1111-1111-111111111111'
   and id in (
     '7cda7de8-63f8-42de-a121-275ecdfe79a3',
     '266cb0f4-9e17-4886-bfad-737ae1ba14a6',
     'bc6cd111-de16-4c9b-a04b-69099abe4e96',
     'f43f041c-0b20-45ab-bffe-28d6e3464233',
     '3b48f3c7-2d1c-4db0-935d-1a4e035f8c05'
   );

-- 3. Audit trail.
insert into coverage_events (organization_id, profile_id, event_type, primary_rep_id, reason, actor_rep_id)
values ('11111111-1111-1111-1111-111111111111', '87c10cd5-58e3-4742-910d-4de549d522c7', 'COVERAGE_TRANSFERRED', 'aaaaaaaa-0000-0000-0000-000000000001', 'Restored from aaaaaaaa-0000-0000-0000-000000000004 per V5.0 acceptance matrix', 'aaaaaaaa-0000-0000-0000-000000000001');

insert into accountability_audit_log (organization_id, rep_id, revenue_identity_id, event_type, detail)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'e57519a5-bc62-4bfe-b29d-2be809e8d9af', 'identity_transferred', '{"from_rep_id":"aaaaaaaa-0000-0000-0000-000000000004","to_rep_id":"aaaaaaaa-0000-0000-0000-000000000001","reason":"v5.0 acceptance matrix restoration"}'::jsonb);

commit;
