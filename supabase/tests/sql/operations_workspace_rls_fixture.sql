-- Minimal pre-Phase-8 schema for the operations RLS matrix.
--
-- Only the tables / helpers / policies the operations migration touches, copied
-- from the migrations that define them (0001, 0021, 20260923 organization_v2,
-- 20261005 action ledger, 20261031 assigned_tasks). Run on an ISOLATED
-- database that already has the Supabase `auth` schema and roles — never on a
-- shared or production database.
--
-- Assumption: the 20260923 tm_select policy references a team_memberships.
-- organization_id column the table does not have; the "before" policy here is
-- that policy without the impossible column (own row or legacy admin).

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table reps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  auth_user_id uuid unique,
  name text not null,
  role text not null default 'rep'
);

create table organization_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  person_id uuid not null references reps(id) on delete cascade,
  role text not null check (role in ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER')),
  unique (organization_id, person_id)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null
);

create table team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  person_id uuid not null references reps(id) on delete cascade,
  membership_role text not null check (membership_role in ('MANAGER', 'MEMBER')),
  active boolean not null default true,
  unique (team_id, person_id)
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  owner_rep_id uuid references reps(id),
  company_key text
);

create table action_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references reps(id) on delete set null,
  referred_to_rep_id uuid references reps(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  action_type text not null,
  occurred_at timestamptz not null default now()
);

-- 20261031120000_assigned_tasks.sql (columns used by policies + app)
create table assigned_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  assignee_rep_id uuid not null references reps(id),
  created_by_rep_id uuid not null references reps(id),
  lead_id uuid references leads(id) on delete set null,
  kind text not null default 'REVIEW',
  title text not null,
  status text not null default 'OPEN',
  due_at timestamptz,
  updated_at timestamptz not null default now()
);

create table task_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null references assigned_tasks(id) on delete cascade,
  event_type text not null check (event_type in (
    'TASK_CREATED', 'TASK_ASSIGNED', 'TASK_REASSIGNED', 'TASK_STARTED', 'TASK_COMPLETED', 'TASK_CANCELLED'
  )),
  actor_rep_id uuid references reps(id),
  created_at timestamptz not null default now()
);

-- Helpers as defined before Phase 8 (0001 / 0021).
create or replace function public.current_rep_id() returns uuid
language sql stable security definer set search_path = public as
$$ select r.id from reps r where r.auth_user_id = auth.uid(); $$;

create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = public as
$$ select r.organization_id from reps r where r.auth_user_id = auth.uid(); $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select r.role from reps r where r.auth_user_id = auth.uid()) = 'admin', false); $$;

create or replace function public.is_org_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select r.role = 'admin' from reps r where r.auth_user_id = auth.uid()), false); $$;

alter table organizations enable row level security;
alter table reps enable row level security;
alter table organization_roles enable row level security;
alter table teams enable row level security;
alter table team_memberships enable row level security;
alter table leads enable row level security;
alter table action_events enable row level security;
alter table assigned_tasks enable row level security;
alter table task_events enable row level security;

create policy reps_select on reps for select to authenticated using (organization_id = current_org_id());
create policy organizations_select on organizations for select to authenticated using (id = current_org_id());
create policy teams_select on teams for select to authenticated using (organization_id = current_org_id());
create policy leads_select on leads for select to authenticated using (organization_id = current_org_id());

-- Pre-Phase-8 policies under test.
create policy "tm_select" on team_memberships for select to authenticated using (
  person_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin()
);

create policy "ae_select" on action_events for select using (
  organization_id = current_org_id() and (
    public.is_admin() or actor_id = public.current_rep_id() or referred_to_rep_id = public.current_rep_id()
  )
);

create policy assigned_tasks_select on assigned_tasks for select to authenticated
  using (organization_id = current_org_id());
create policy assigned_tasks_insert on assigned_tasks for insert to authenticated
  with check (organization_id = current_org_id() and created_by_rep_id = current_rep_id());
create policy assigned_tasks_update on assigned_tasks for update to authenticated using (
  organization_id = current_org_id()
  and (assignee_rep_id = current_rep_id() or created_by_rep_id = current_rep_id() or is_org_admin())
) with check (organization_id = current_org_id());

create policy task_events_select on task_events for select to authenticated
  using (organization_id = current_org_id());

-- Supabase projects grant table privileges to API roles by default and rely
-- on RLS for row access; mirror that so new migration tables behave the same.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
