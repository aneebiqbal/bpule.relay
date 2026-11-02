-- Phase 8: operations workspace — authority, manager scope, notes, saved views.
--
-- 1. One canonical admin authority: is_org_admin_or_owner() reads
--    organization_roles (OWNER/ADMIN). Legacy reps.role = 'admin' counts only
--    when the person has NO organization_roles row (bootstrap compatibility).
--    is_admin() and is_org_admin() delegate to it, so every existing policy
--    follows the canonical model without being rewritten.
-- 2. Manager scope: a manager reads team_memberships of teams they manage,
--    action_events of members of those teams, and assigned tasks / task
--    events of those members. Nothing else widens.
-- 3. assigned_tasks / task_events reads follow rep / manager / admin scope
--    (they were org-wide).
-- 4. internal_notes (+ audit) — scoped by subject in the database.
-- 5. saved_views — private to the owner.
-- 6. task_events accepts TASK_RESCHEDULED.
--
-- Behaviour change to review before applying (see
-- docs/RELAY_OPERATIONS_WORKSPACE_V2.md §10):
--   * reps.role = 'admin' WITH an organization_roles row of MANAGER/MEMBER
--     loses database admin (the app already treats them as non-admin).
--   * organization_roles ADMIN/OWNER WITH reps.role <> 'admin' gains database
--     admin (the app already treats them as admin).
--
-- Idempotent. Verified against an isolated Postgres with the RLS matrix in
-- supabase/tests/operations_workspace_rls.sql.

-- ============================================================================
-- 1. Canonical admin authority
-- ============================================================================

create or replace function public.is_org_admin_or_owner() returns boolean
language sql stable security definer set search_path = public as
$$
  select coalesce((
    select case
      when o.role is not null then o.role in ('OWNER', 'ADMIN')
      else r.role = 'admin'
    end
    from reps r
    left join organization_roles o
      on o.person_id = r.id and o.organization_id = r.organization_id
    where r.auth_user_id = auth.uid()
    limit 1
  ), false);
$$;

-- Legacy names keep working and now share the one authority.
create or replace function public.is_org_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select public.is_org_admin_or_owner(); $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select public.is_org_admin_or_owner(); $$;

-- Superseded by is_org_admin_or_owner(); removed if an earlier draft created it.
drop function if exists public.has_org_admin_role();

-- ============================================================================
-- 2. Manager scope helpers
-- ============================================================================

-- The signed-in rep actively manages this team, and the team is in their org.
create or replace function public.manages_team(target_team_id uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1
    from team_memberships m
    join teams t on t.id = m.team_id
    where m.team_id = target_team_id
      and m.person_id = current_rep_id()
      and m.membership_role = 'MANAGER'
      and m.active
      and t.organization_id = current_org_id()
  );
$$;

-- The signed-in rep actively manages a team the target rep is an active member of.
create or replace function public.is_org_manager_of(target_rep_id uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1
    from team_memberships managed
    join team_memberships member on member.team_id = managed.team_id
    join teams t on t.id = managed.team_id
    where managed.person_id = current_rep_id()
      and managed.membership_role = 'MANAGER'
      and managed.active
      and member.person_id = target_rep_id
      and member.active
      and t.organization_id = current_org_id()
  );
$$;

-- Self, a managed team member, or anyone for an org admin/owner.
create or replace function public.can_see_rep(target_rep_id uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select target_rep_id is not null and (
    target_rep_id = current_rep_id()
    or public.is_org_admin_or_owner()
    or public.is_org_manager_of(target_rep_id)
  );
$$;

revoke all on function public.is_org_admin_or_owner() from public;
revoke all on function public.manages_team(uuid) from public;
revoke all on function public.is_org_manager_of(uuid) from public;
revoke all on function public.can_see_rep(uuid) from public;
grant execute on function public.is_org_admin_or_owner() to authenticated;
grant execute on function public.manages_team(uuid) to authenticated;
grant execute on function public.is_org_manager_of(uuid) to authenticated;
grant execute on function public.can_see_rep(uuid) to authenticated;

-- ============================================================================
-- 3. Manager visibility policies
-- ============================================================================

-- team_memberships has no organization_id column; scope through teams.
-- A manager sees the rows of teams they manage — not a member's other teams.
drop policy if exists "tm_select" on team_memberships;
create policy "tm_select" on team_memberships for select
  to authenticated using (
    exists (select 1 from teams t where t.id = team_memberships.team_id and t.organization_id = current_org_id())
    and (
      person_id = current_rep_id()
      or public.is_org_admin_or_owner()
      or public.manages_team(team_id)
    )
  );

drop policy if exists "ae_select" on action_events;
create policy "ae_select" on action_events for select
  to authenticated using (
    organization_id = current_org_id() and (
      public.can_see_rep(actor_id)
      or referred_to_rep_id = public.current_rep_id()
    )
  );

-- assigned_tasks / task_events are absent from the production schema today (the
-- 20261031120000 migration that creates them is unrecorded and unapplied), so
-- these policies are guarded: the migration must apply cleanly to a schema that
-- predates them, and the task tables pick the policies up when they are created.
do $$
begin
  if to_regclass('public.assigned_tasks') is not null then
    drop policy if exists assigned_tasks_select on assigned_tasks;
    create policy assigned_tasks_select on assigned_tasks for select
      to authenticated using (
        organization_id = current_org_id()
        and (public.can_see_rep(assignee_rep_id) or created_by_rep_id = current_rep_id())
      );

    -- Managers may also update (reassign / reschedule / cancel) their team's tasks;
    -- the app enforces which action each role may take.
    drop policy if exists assigned_tasks_update on assigned_tasks;
    create policy assigned_tasks_update on assigned_tasks for update
      to authenticated using (
        organization_id = current_org_id()
        and (public.can_see_rep(assignee_rep_id) or created_by_rep_id = current_rep_id())
      )
      with check (organization_id = current_org_id() and public.can_see_rep(assignee_rep_id));
  end if;

  -- A task event is visible exactly when its task is (the subquery is RLS-filtered).
  if to_regclass('public.task_events') is not null then
    drop policy if exists task_events_select on task_events;
    create policy task_events_select on task_events for select
      to authenticated using (
        organization_id = current_org_id()
        and exists (select 1 from assigned_tasks t where t.id = task_events.task_id)
      );
  end if;
end
$$;

-- ============================================================================
-- 4. task_events: due-date changes are part of the task audit trail
-- ============================================================================

do $$
begin
  if to_regclass('public.task_events') is not null then
    alter table task_events drop constraint if exists task_events_event_type_check;
    alter table task_events add constraint task_events_event_type_check
      check (event_type in (
        'TASK_CREATED',
        'TASK_ASSIGNED',
        'TASK_REASSIGNED',
        'TASK_STARTED',
        'TASK_COMPLETED',
        'TASK_CANCELLED',
        'TASK_RESCHEDULED'
      ));
  end if;
end
$$;

-- ============================================================================
-- 5. internal_notes
-- ============================================================================

create table if not exists internal_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  subject_type text not null check (subject_type in ('LEAD', 'ACCOUNT', 'REP', 'TASK')),
  -- LEAD/REP/TASK: the row uuid as text. ACCOUNT: the lead company_key.
  subject_id text not null,
  author_rep_id uuid not null references reps(id),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by_rep_id uuid references reps(id),
  constraint internal_notes_subject_id_shape check (
    subject_type = 'ACCOUNT'
    or subject_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

create index if not exists internal_notes_subject_idx
  on internal_notes (organization_id, subject_type, subject_id, created_at desc)
  where deleted_at is null;
create index if not exists internal_notes_author_idx on internal_notes (author_rep_id, created_at desc);

-- Subject scope, evaluated in the database:
--   LEAD    → the lead's owner is visible to me
--   ACCOUNT → I can see an owner of some lead at that company
--   REP     → the rep is a managed member (or I am admin). Not the subject
--             rep themselves: manager notes about a person stay with managers.
--   TASK    → the task's assignee is visible to me, or I created it
create or replace function public.can_access_note_subject(p_subject_type text, p_subject_id text) returns boolean
language plpgsql stable security definer set search_path = public as
$$
declare
  me uuid := current_rep_id();
  org uuid := current_org_id();
begin
  if me is null or org is null then
    return false;
  end if;
  if public.is_org_admin_or_owner() then
    if p_subject_type = 'ACCOUNT' then
      return exists (select 1 from leads l where l.organization_id = org and l.company_key = p_subject_id);
    elsif p_subject_type = 'LEAD' then
      return exists (select 1 from leads l where l.organization_id = org and l.id = p_subject_id::uuid);
    elsif p_subject_type = 'REP' then
      return exists (select 1 from reps r where r.organization_id = org and r.id = p_subject_id::uuid);
    elsif p_subject_type = 'TASK' then
      return exists (select 1 from assigned_tasks t where t.organization_id = org and t.id = p_subject_id::uuid);
    end if;
    return false;
  end if;

  if p_subject_type = 'LEAD' then
    return exists (
      select 1 from leads l
      where l.organization_id = org and l.id = p_subject_id::uuid and public.can_see_rep(l.owner_rep_id)
    );
  elsif p_subject_type = 'ACCOUNT' then
    return exists (
      select 1 from leads l
      where l.organization_id = org and l.company_key = p_subject_id and public.can_see_rep(l.owner_rep_id)
    );
  elsif p_subject_type = 'REP' then
    return public.is_org_manager_of(p_subject_id::uuid);
  elsif p_subject_type = 'TASK' then
    return exists (
      select 1 from assigned_tasks t
      where t.organization_id = org and t.id = p_subject_id::uuid
        and (public.can_see_rep(t.assignee_rep_id) or t.created_by_rep_id = me)
    );
  end if;
  return false;
exception
  when invalid_text_representation then
    return false;
end;
$$;

revoke all on function public.can_access_note_subject(text, text) from public;
grant execute on function public.can_access_note_subject(text, text) to authenticated;

alter table internal_notes enable row level security;

drop policy if exists internal_notes_select on internal_notes;
create policy internal_notes_select on internal_notes for select
  to authenticated using (
    organization_id = current_org_id()
    and (author_rep_id = current_rep_id() or public.can_access_note_subject(subject_type, subject_id))
  );

drop policy if exists internal_notes_insert on internal_notes;
create policy internal_notes_insert on internal_notes for insert
  to authenticated with check (
    organization_id = current_org_id()
    and author_rep_id = current_rep_id()
    and deleted_at is null
    and public.can_access_note_subject(subject_type, subject_id)
  );

-- Author edits / deletes their own note; an admin may soft-delete any note.
-- What may change is enforced by internal_notes_guard below.
drop policy if exists internal_notes_update on internal_notes;
create policy internal_notes_update on internal_notes for update
  to authenticated using (
    organization_id = current_org_id()
    and (author_rep_id = current_rep_id() or public.is_org_admin_or_owner())
  )
  with check (organization_id = current_org_id());

-- No hard deletes through the API: the audit trail must survive.
drop policy if exists internal_notes_delete on internal_notes;

create or replace function public.internal_notes_guard() returns trigger
language plpgsql security invoker set search_path = public as
$$
begin
  -- Service role / migrations (no signed-in rep) are not restricted here.
  if current_rep_id() is null then
    return new;
  end if;
  if new.organization_id is distinct from old.organization_id
     or new.subject_type is distinct from old.subject_type
     or new.subject_id is distinct from old.subject_id
     or new.author_rep_id is distinct from old.author_rep_id
     or new.created_at is distinct from old.created_at then
    raise exception 'internal note subject, author and creation time are immutable';
  end if;
  if new.body is distinct from old.body and old.author_rep_id is distinct from current_rep_id() then
    raise exception 'only the author can edit a note';
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'deleted notes cannot be restored through the API';
  end if;
  return new;
end;
$$;

drop trigger if exists internal_notes_guard on internal_notes;
create trigger internal_notes_guard
  before update on internal_notes
  for each row execute function public.internal_notes_guard();

-- Audit: every create / edit / delete is kept, never overwritten.
create table if not exists internal_note_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  note_id uuid not null references internal_notes(id) on delete cascade,
  event_type text not null check (event_type in ('NOTE_CREATED', 'NOTE_EDITED', 'NOTE_DELETED')),
  actor_rep_id uuid references reps(id),
  previous_body text,
  created_at timestamptz not null default now()
);

create index if not exists internal_note_events_note_idx on internal_note_events (note_id, created_at desc);

alter table internal_note_events enable row level security;

-- Previous bodies are as sensitive as the note: visible to admins, or to
-- whoever can currently read the note (subquery is RLS-filtered).
drop policy if exists internal_note_events_select on internal_note_events;
create policy internal_note_events_select on internal_note_events for select
  to authenticated using (
    organization_id = current_org_id()
    and (
      public.is_org_admin_or_owner()
      or exists (select 1 from internal_notes n where n.id = internal_note_events.note_id)
    )
  );

drop policy if exists internal_note_events_insert on internal_note_events;
create policy internal_note_events_insert on internal_note_events for insert
  to authenticated with check (
    organization_id = current_org_id()
    and actor_rep_id = current_rep_id()
    and exists (select 1 from internal_notes n where n.id = internal_note_events.note_id)
  );

-- ============================================================================
-- 6. saved_views — private to the owner
-- ============================================================================

create table if not exists saved_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_rep_id uuid not null references reps(id) on delete cascade,
  -- The surface the view belongs to, e.g. 'team.people', 'team.tasks', 'leads'.
  surface text not null check (char_length(surface) between 1 and 64),
  name text not null check (char_length(name) between 1 and 80),
  -- URL query string the view restores (without leading '?').
  query text not null default '' check (char_length(query) <= 2000),
  -- Scope the view was saved under ('own' | 'team' | 'org'); informational.
  scope text not null default 'own' check (scope in ('own', 'team', 'org')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_rep_id, surface, name)
);

create index if not exists saved_views_owner_idx on saved_views (owner_rep_id, surface);

alter table saved_views enable row level security;

drop policy if exists saved_views_owner on saved_views;
create policy saved_views_owner on saved_views for all
  to authenticated using (
    organization_id = current_org_id() and owner_rep_id = current_rep_id()
  )
  with check (
    organization_id = current_org_id() and owner_rep_id = current_rep_id()
  );
