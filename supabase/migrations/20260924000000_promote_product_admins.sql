-- Product admins (reps.role = 'admin') were seeded as MEMBER in organization_roles.
-- Admin APIs then denied Identities / Targets even though the UI treated them as admin.
-- Promote those people to ADMIN (never demote OWNER) and seed capabilities for every org.

update organization_roles orl
set role = 'ADMIN', updated_at = now()
from reps r
where orl.person_id = r.id
  and r.role = 'admin'
  and orl.role not in ('OWNER', 'ADMIN');

insert into organization_roles (organization_id, person_id, role, granted_by)
select r.organization_id, r.id, 'ADMIN', r.id
from reps r
where r.role = 'admin'
  and not exists (
    select 1 from organization_roles orl
    where orl.organization_id = r.organization_id
      and orl.person_id = r.id
  );

do $$
declare
  org record;
begin
  for org in select id from organizations loop
    insert into capabilities (organization_id, role, capability, granted) values
      (org.id, 'OWNER', 'MANAGE_TEAM_MEMBERS', true),
      (org.id, 'OWNER', 'VIEW_TEAM_WORK', true),
      (org.id, 'OWNER', 'ASSIGN_TEAM_WORK', true),
      (org.id, 'OWNER', 'MANAGE_TEAM_TARGETS', true),
      (org.id, 'OWNER', 'VIEW_TEAM_ANALYTICS', true),
      (org.id, 'OWNER', 'MANAGE_REVENUE_IDENTITIES', true),
      (org.id, 'OWNER', 'MANAGE_ORG_USERS', true),
      (org.id, 'OWNER', 'MANAGE_ORG_SETTINGS', true),
      (org.id, 'OWNER', 'ACCESS_REVENUE_INTELLIGENCE', true),
      (org.id, 'OWNER', 'ACCESS_RELAY_GROWTH', true),
      (org.id, 'OWNER', 'MANAGE_ACCOUNTABILITY_POLICY', true),
      (org.id, 'OWNER', 'REVIEW_TEAM_ACCOUNTABILITY', true),
      (org.id, 'OWNER', 'APPROVE_REWARDS', true),
      (org.id, 'ADMIN', 'MANAGE_TEAM_MEMBERS', true),
      (org.id, 'ADMIN', 'VIEW_TEAM_WORK', true),
      (org.id, 'ADMIN', 'ASSIGN_TEAM_WORK', true),
      (org.id, 'ADMIN', 'MANAGE_TEAM_TARGETS', true),
      (org.id, 'ADMIN', 'VIEW_TEAM_ANALYTICS', true),
      (org.id, 'ADMIN', 'MANAGE_REVENUE_IDENTITIES', true),
      (org.id, 'ADMIN', 'MANAGE_ORG_USERS', true),
      (org.id, 'ADMIN', 'ACCESS_REVENUE_INTELLIGENCE', true),
      (org.id, 'ADMIN', 'ACCESS_RELAY_GROWTH', true),
      (org.id, 'ADMIN', 'MANAGE_ACCOUNTABILITY_POLICY', true),
      (org.id, 'ADMIN', 'REVIEW_TEAM_ACCOUNTABILITY', true),
      (org.id, 'ADMIN', 'APPROVE_REWARDS', true),
      (org.id, 'MANAGER', 'VIEW_TEAM_WORK', true),
      (org.id, 'MANAGER', 'ASSIGN_TEAM_WORK', true),
      (org.id, 'MANAGER', 'VIEW_TEAM_ANALYTICS', true),
      (org.id, 'MANAGER', 'MANAGE_TEAM_TARGETS', true),
      (org.id, 'MANAGER', 'REVIEW_TEAM_ACCOUNTABILITY', true),
      (org.id, 'MEMBER', 'VIEW_OWN_WORK', true),
      (org.id, 'MEMBER', 'EXECUTE_OWN_WORK', true)
    on conflict do nothing;
  end loop;
end $$;
