-- 20260921: Add accountability capabilities to organization roles
--
-- Adds the new Accountability OS capabilities to the existing capabilities table.

do $$
declare
  org_id uuid;
begin
  select id into org_id from organizations limit 1;
  if org_id is null then return; end if;

  -- OWNER: all accountability capabilities
  insert into capabilities (organization_id, role, capability, granted) values
    (org_id, 'OWNER', 'MANAGE_ACCOUNTABILITY_POLICY', true),
    (org_id, 'OWNER', 'MANAGE_TEAM_TARGETS', true),
    (org_id, 'OWNER', 'VIEW_TEAM_WORK', true),
    (org_id, 'OWNER', 'VIEW_TEAM_ANALYTICS', true),
    (org_id, 'OWNER', 'REVIEW_TEAM_ACCOUNTABILITY', true),
    (org_id, 'OWNER', 'APPROVE_REWARDS', true)
  on conflict do nothing;

  -- ADMIN: broad accountability capabilities
  insert into capabilities (organization_id, role, capability, granted) values
    (org_id, 'ADMIN', 'MANAGE_ACCOUNTABILITY_POLICY', true),
    (org_id, 'ADMIN', 'MANAGE_TEAM_TARGETS', true),
    (org_id, 'ADMIN', 'VIEW_TEAM_WORK', true),
    (org_id, 'ADMIN', 'VIEW_TEAM_ANALYTICS', true),
    (org_id, 'ADMIN', 'REVIEW_TEAM_ACCOUNTABILITY', true),
    (org_id, 'ADMIN', 'APPROVE_REWARDS', true)
  on conflict do nothing;

  -- MANAGER: team-scoped accountability
  insert into capabilities (organization_id, role, capability, granted) values
    (org_id, 'MANAGER', 'VIEW_TEAM_WORK', true),
    (org_id, 'MANAGER', 'VIEW_TEAM_ANALYTICS', true),
    (org_id, 'MANAGER', 'REVIEW_TEAM_ACCOUNTABILITY', true)
  on conflict do nothing;

  -- MEMBER: personal accountability only
  insert into capabilities (organization_id, role, capability, granted) values
    (org_id, 'MEMBER', 'VIEW_OWN_WORK', true),
    (org_id, 'MEMBER', 'EXECUTE_OWN_WORK', true)
  on conflict do nothing;
end $$;
