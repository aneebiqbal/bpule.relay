-- Phase 6: persistent assigned tasks (human requests).
-- Derived work stays a projection of canonical sales state — not stored here.

create table if not exists assigned_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  assignee_rep_id uuid not null references reps(id),
  created_by_rep_id uuid not null references reps(id),
  lead_id uuid references leads(id) on delete set null,
  profile_id uuid,
  kind text not null check (kind in (
    'ADMIN', 'REVIEW', 'CALL', 'RESEARCH', 'PREPARE_PROPOSAL', 'CUSTOM', 'REQUEST_UPDATE'
  )),
  title text not null,
  description text,
  priority text not null default 'NORMAL'
    check (priority in ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
  due_at timestamptz,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  previous_assignee_rep_id uuid references reps(id)
);

create index if not exists assigned_tasks_org_idx on assigned_tasks (organization_id);
create index if not exists assigned_tasks_assignee_status_idx
  on assigned_tasks (assignee_rep_id, status);
create index if not exists assigned_tasks_due_idx on assigned_tasks (due_at)
  where status in ('OPEN', 'IN_PROGRESS');
create index if not exists assigned_tasks_lead_idx on assigned_tasks (lead_id)
  where lead_id is not null;
create index if not exists assigned_tasks_org_status_idx
  on assigned_tasks (organization_id, status);

-- Lifecycle audit — separate from sales action_events so completions do not
-- inflate commercial activity counters.
create table if not exists task_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null references assigned_tasks(id) on delete cascade,
  event_type text not null check (event_type in (
    'TASK_CREATED',
    'TASK_ASSIGNED',
    'TASK_REASSIGNED',
    'TASK_STARTED',
    'TASK_COMPLETED',
    'TASK_CANCELLED'
  )),
  actor_rep_id uuid references reps(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_events_task_idx on task_events (task_id, created_at desc);
create index if not exists task_events_org_idx on task_events (organization_id, created_at desc);

alter table assigned_tasks enable row level security;
alter table task_events enable row level security;

-- Org members can read org tasks. Application layer scopes manager vs rep.
-- Cross-org blocked via current_org_id().
drop policy if exists assigned_tasks_select on assigned_tasks;
create policy assigned_tasks_select on assigned_tasks for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists assigned_tasks_insert on assigned_tasks;
create policy assigned_tasks_insert on assigned_tasks for insert
  to authenticated with check (
    organization_id = current_org_id()
    and created_by_rep_id = current_rep_id()
  );

drop policy if exists assigned_tasks_update on assigned_tasks;
create policy assigned_tasks_update on assigned_tasks for update
  to authenticated using (
    organization_id = current_org_id()
    and (
      assignee_rep_id = current_rep_id()
      or created_by_rep_id = current_rep_id()
      or is_org_admin()
    )
  )
  with check (organization_id = current_org_id());

drop policy if exists task_events_select on task_events;
create policy task_events_select on task_events for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists task_events_insert on task_events;
create policy task_events_insert on task_events for insert
  to authenticated with check (
    organization_id = current_org_id()
    and (actor_rep_id = current_rep_id() or actor_rep_id is null)
  );
