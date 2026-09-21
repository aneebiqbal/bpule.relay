-- 20260923: Organization V2 — teams, roles, capabilities
--
-- Adds the organizational structure for the new authorization model:
--   1. teams — named organizational units (BD, Development, etc.)
--   2. team_memberships — person ↔ team with role (MANAGER/MEMBER)
--   3. organization_roles — OWNER/ADMIN/MANAGER/MEMBER per person
--   4. capabilities — granular permissions granted to roles
--
-- All tables are tenant-scoped via organization_id with RLS.

-- ============================================================================
-- TEAMS
-- ============================================================================

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists teams_org_idx on teams (organization_id);
alter table teams enable row level security;

drop policy if exists "teams_select" on teams;
create policy "teams_select" on teams for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "teams_insert" on teams;
create policy "teams_insert" on teams for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "teams_update" on teams;
create policy "teams_update" on teams for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- TEAM MEMBERSHIPS
-- ============================================================================

create table if not exists team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  person_id uuid not null references reps(id) on delete cascade,
  membership_role text not null check (membership_role in ('MANAGER', 'MEMBER')),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (team_id, person_id)
);

create index if not exists tm_team_idx on team_memberships (team_id);
create index if not exists tm_person_idx on team_memberships (person_id);
create index if not exists tm_active_idx on team_memberships (team_id, active) where active = true;
alter table team_memberships enable row level security;

drop policy if exists "tm_select" on team_memberships;
create policy "tm_select" on team_memberships for select
  to authenticated using (
    organization_id = current_org_id()
    and (person_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin())
  );

drop policy if exists "tm_insert" on team_memberships;
create policy "tm_insert" on team_memberships for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "tm_update" on team_memberships;
create policy "tm_update" on team_memberships for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- ORGANIZATION ROLES
-- ============================================================================

create table if not exists organization_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  person_id uuid not null references reps(id) on delete cascade,
  role text not null check (role in ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER')),
  granted_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, person_id)
);

create index if not exists org_roles_org_idx on organization_roles (organization_id);
create index if not exists org_roles_person_idx on organization_roles (person_id);
alter table organization_roles enable row level security;

drop policy if exists "org_roles_select" on organization_roles;
create policy "org_roles_select" on organization_roles for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "org_roles_insert" on organization_roles;
create policy "org_roles_insert" on organization_roles for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "org_roles_update" on organization_roles;
create policy "org_roles_update" on organization_roles for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- CAPABILITIES
-- ============================================================================

create table if not exists capabilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  role text not null check (role in ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER')),
  capability text not null,
  granted boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, role, capability)
);

create index if not exists cap_org_idx on capabilities (organization_id);
create index if not exists cap_org_role_idx on capabilities (organization_id, role);
alter table capabilities enable row level security;

drop policy if exists "cap_select" on capabilities;
create policy "cap_select" on capabilities for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "cap_insert" on capabilities;
create policy "cap_insert" on capabilities for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "cap_update" on capabilities;
create policy "cap_update" on capabilities for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- SEED: Default capabilities per role
-- ============================================================================

do $$
declare
  org_id uuid;
begin
  select id into org_id from organizations limit 1;
  if org_id is null then return; end if;

  -- OWNER: all capabilities
  insert into capabilities (organization_id, role, capability, granted) values
    (org_id, 'OWNER', 'MANAGE_TEAM_MEMBERS', true),
    (org_id, 'OWNER', 'VIEW_TEAM_WORK', true),
    (org_id, 'OWNER', 'ASSIGN_TEAM_WORK', true),
    (org_id, 'OWNER', 'MANAGE_TEAM_TARGETS', true),
    (org_id, 'OWNER', 'VIEW_TEAM_ANALYTICS', true),
    (org_id, 'OWNER', 'MANAGE_REVENUE_IDENTITIES', true),
    (org_id, 'OWNER', 'MANAGE_ORG_USERS', true),
    (org_id, 'OWNER', 'MANAGE_ORG_SETTINGS', true),
    (org_id, 'OWNER', 'ACCESS_REVENUE_INTELLIGENCE', true),
    (org_id, 'OWNER', 'ACCESS_RELAY_GROWTH', true)
  on conflict do nothing;

  -- ADMIN: broad but not owner-level
  insert into capabilities (organization_id, role, capability, granted) values
    (org_id, 'ADMIN', 'MANAGE_TEAM_MEMBERS', true),
    (org_id, 'ADMIN', 'VIEW_TEAM_WORK', true),
    (org_id, 'ADMIN', 'ASSIGN_TEAM_WORK', true),
    (org_id, 'ADMIN', 'MANAGE_TEAM_TARGETS', true),
    (org_id, 'ADMIN', 'VIEW_TEAM_ANALYTICS', true),
    (org_id, 'ADMIN', 'MANAGE_REVENUE_IDENTITIES', true),
    (org_id, 'ADMIN', 'MANAGE_ORG_USERS', true),
    (org_id, 'ADMIN', 'ACCESS_REVENUE_INTELLIGENCE', true),
    (org_id, 'ADMIN', 'ACCESS_RELAY_GROWTH', true)
  on conflict do nothing;

  -- MANAGER: team-scoped
  insert into capabilities (organization_id, role, capability, granted) values
    (org_id, 'MANAGER', 'VIEW_TEAM_WORK', true),
    (org_id, 'MANAGER', 'ASSIGN_TEAM_WORK', true),
    (org_id, 'MANAGER', 'VIEW_TEAM_ANALYTICS', true),
    (org_id, 'MANAGER', 'MANAGE_TEAM_TARGETS', true)
  on conflict do nothing;

  -- MEMBER: personal work only
  insert into capabilities (organization_id, role, capability, granted) values
    (org_id, 'MEMBER', 'VIEW_OWN_WORK', true),
    (org_id, 'MEMBER', 'EXECUTE_OWN_WORK', true)
  on conflict do nothing;

  -- Seed default teams
  insert into teams (organization_id, name, description) values
    (org_id, 'BD', 'Business Development team'),
    (org_id, 'Development', 'Software development team'),
    (org_id, 'Content', 'Content and marketing team')
  on conflict do nothing;

  -- Seed organization roles for existing users
  -- Fizza (hassan@scout.dev) → OWNER
  insert into organization_roles (organization_id, person_id, role, granted_by)
  select org_id, r.id, 'OWNER', r.id
  from reps r
  where r.auth_user_id = (select id from auth.users where email = 'hassan@scout.dev' limit 1)
  on conflict do nothing;

  -- All other existing users → MEMBER (safe default)
  insert into organization_roles (organization_id, person_id, role, granted_by)
  select org_id, r.id, 'MEMBER', r.id
  from reps r
  where r.auth_user_id != (select id from auth.users where email = 'hassan@scout.dev' limit 1)
  on conflict do nothing;

  -- Seed team memberships
  -- Hassan → BD Manager
  insert into team_memberships (team_id, person_id, membership_role)
  select t.id, r.id, 'MANAGER'
  from teams t, reps r
  where t.name = 'BD' and t.organization_id = org_id
    and r.auth_user_id = (select id from auth.users where email = 'hassan@scout.dev' limit 1)
  on conflict do nothing;

  -- All other reps → BD Member (for now)
  insert into team_memberships (team_id, person_id, membership_role)
  select t.id, r.id, 'MEMBER'
  from teams t, reps r
  where t.name = 'BD' and t.organization_id = org_id
    and r.auth_user_id != (select id from auth.users where email = 'hassan@scout.dev' limit 1)
  on conflict do nothing;
end $$;
