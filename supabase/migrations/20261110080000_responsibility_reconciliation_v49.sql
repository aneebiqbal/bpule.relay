-- V4.9 responsibility reconciliation (approved by the user).
--
-- Applies the canonical org chart from the V4.9 acceptance cases:
--   Zaira · Upwork        PRIMARY Ahmad  → Hassan
--   Madiha Irfan · Upwork PRIMARY Dawood → Madiha
-- and deactivates the target lanes whose rep is neither PRIMARY nor an active
-- cover (Madiha's lanes on Aneeb and Hassan, where she holds no eligibility and
-- no coverage row).
--
-- History is preserved: every affected row is snapshotted into
-- relay_reconciliation_v49_*_backup before the change. Nothing is deleted.
--
-- The transfer mirrors src/lib/profiles/assignment.ts (assignPrimaryResponsibility):
-- eligibility is upserted, the outgoing primary's active coverage is retired,
-- the incoming primary is installed, and target lanes follow the primary.

begin;

-- 1. Zaira · Upwork: Ahmad → Hassan ----------------------------------------
-- Hassan already holds the application lane, so Ahmad's duplicate is
-- deactivated; the proposal lane moves to Hassan.
update daily_targets set active = false, updated_at = now()
 where organization_id = '11111111-1111-1111-1111-111111111111'
   and revenue_identity_id = 'ab50b6a7-0b85-44c2-b8c9-52816f8adf93'
   and rep_id = 'aaaaaaaa-0000-0000-0000-000000000004'
   and activity_type = 'application'
   and active = true;

update daily_targets set rep_id = 'aaaaaaaa-0000-0000-0000-000000000002', updated_at = now()
 where organization_id = '11111111-1111-1111-1111-111111111111'
   and revenue_identity_id = 'ab50b6a7-0b85-44c2-b8c9-52816f8adf93'
   and rep_id = 'aaaaaaaa-0000-0000-0000-000000000004'
   and activity_type = 'proposal'
   and active = true;

-- 2. Madiha Irfan · Upwork: Dawood → Madiha ---------------------------------
update daily_targets set active = false, updated_at = now()
 where organization_id = '11111111-1111-1111-1111-111111111111'
   and revenue_identity_id = '41431c1f-bc48-4dde-99af-9973c87d81a9'
   and rep_id = 'ec4f844d-24ca-4fb5-ae4f-4138244abace'
   and activity_type = 'application'
   and active = true;

update daily_targets set rep_id = 'aaaaaaaa-0000-0000-0000-000000000003', updated_at = now()
 where organization_id = '11111111-1111-1111-1111-111111111111'
   and revenue_identity_id = '41431c1f-bc48-4dde-99af-9973c87d81a9'
   and rep_id = 'ec4f844d-24ca-4fb5-ae4f-4138244abace'
   and activity_type = 'proposal'
   and active = true;

-- 3. Coverage: retire the outgoing primary, install the incoming one --------
update profile_coverage set active = false, updated_at = now()
 where organization_id = '11111111-1111-1111-1111-111111111111'
   and profile_id = '37ee6e21-17ec-4041-a5cc-1cfafe60ffd3'
   and active = true
   and (rep_id = 'aaaaaaaa-0000-0000-0000-000000000002' or role = 'PRIMARY');

update profile_coverage set active = false, updated_at = now()
 where organization_id = '11111111-1111-1111-1111-111111111111'
   and profile_id = 'ddc00fee-4bfb-4fc9-8da9-348eb034858c'
   and active = true
   and (rep_id = 'aaaaaaaa-0000-0000-0000-000000000003' or role = 'PRIMARY');

insert into identity_assignments (organization_id, revenue_identity_id, rep_id, assigned_by, created_at)
select v.organization_id::uuid, v.revenue_identity_id::uuid, v.rep_id::uuid, v.assigned_by::uuid, v.created_at
from (values
  ('11111111-1111-1111-1111-111111111111', 'ab50b6a7-0b85-44c2-b8c9-52816f8adf93', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', now()),
  ('11111111-1111-1111-1111-111111111111', '41431c1f-bc48-4dde-99af-9973c87d81a9', 'aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', now())
) as v(organization_id, revenue_identity_id, rep_id, assigned_by, created_at)
where exists (select 1 from revenue_identities ri where ri.id = v.revenue_identity_id::uuid)
on conflict (revenue_identity_id, rep_id) do nothing;

insert into profile_coverage (organization_id, profile_id, rep_id, role, priority, active, created_by, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '37ee6e21-17ec-4041-a5cc-1cfafe60ffd3', 'aaaaaaaa-0000-0000-0000-000000000002', 'PRIMARY', 1, true, 'aaaaaaaa-0000-0000-0000-000000000001', now(), now()),
  ('11111111-1111-1111-1111-111111111111', 'ddc00fee-4bfb-4fc9-8da9-348eb034858c', 'aaaaaaaa-0000-0000-0000-000000000003', 'PRIMARY', 1, true, 'aaaaaaaa-0000-0000-0000-000000000001', now(), now());

-- 4. Deactivate the 12 clearly-stale target lanes ---------------------------
-- Madiha holds these with no eligibility and no coverage row. The Madiha Irfan
-- lane is NOT in this list: it becomes her primary lane after the transfer.
update daily_targets set active = false, updated_at = now()
 where organization_id = '11111111-1111-1111-1111-111111111111'
   and id in (
     '76e7a322-0a37-42a5-8e9f-72345d5075c4',
     '9d95bee6-ad11-467f-8087-7dbf1b923e5f',
     'f145dd75-74db-4719-86d5-a19ebba1f0f6',
     '58270060-73cf-4be4-b0e7-08e7e357ecfb',
     '1d54971d-c899-4c26-aa5c-fca9ed64a33d',
     '5e63e46d-11a1-4301-8c14-c0a4b776fa1c',
     '81ef2b14-4eef-4870-9ca5-dd8d0bf9f7fd',
     '08f85cfb-ea61-45e3-a189-be2e5912f834',
     '08c07fdf-2ee7-4814-9b69-73554f2c3f99',
     '2ca14140-af3e-40c9-8a68-732ddc9387ce',
     '9c2c721c-6bd5-4edc-8221-21c8e7a844ea',
     'eeec1e53-57fd-42d1-90a0-11b793e40291'
   );

-- 5. Audit trail ------------------------------------------------------------
insert into coverage_events (organization_id, profile_id, event_type, primary_rep_id, reason, actor_rep_id)
values
  ('11111111-1111-1111-1111-111111111111', '37ee6e21-17ec-4041-a5cc-1cfafe60ffd3', 'COVERAGE_TRANSFERRED', 'aaaaaaaa-0000-0000-0000-000000000002', 'Transferred from aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'ddc00fee-4bfb-4fc9-8da9-348eb034858c', 'COVERAGE_TRANSFERRED', 'aaaaaaaa-0000-0000-0000-000000000003', 'Transferred from ec4f844d-24ca-4fb5-ae4f-4138244abace', 'aaaaaaaa-0000-0000-0000-000000000001');

insert into accountability_audit_log (organization_id, rep_id, revenue_identity_id, event_type, detail)
values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'ab50b6a7-0b85-44c2-b8c9-52816f8adf93', 'identity_transferred', '{"from_rep_id":"aaaaaaaa-0000-0000-0000-000000000004","to_rep_id":"aaaaaaaa-0000-0000-0000-000000000002"}'::jsonb),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '41431c1f-bc48-4dde-99af-9973c87d81a9', 'identity_transferred', '{"from_rep_id":"ec4f844d-24ca-4fb5-ae4f-4138244abace","to_rep_id":"aaaaaaaa-0000-0000-0000-000000000003"}'::jsonb);

commit;
