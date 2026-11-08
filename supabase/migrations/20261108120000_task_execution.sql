-- RELAY V4 — Task execution layer.
--
-- Additive only: no existing row is rewritten and no ownership semantics move.
--   * WAITING is a real execution state (the rep is blocked, not idle).
--   * transfer request fields let a rep ask for a handoff without silently
--     moving work; only a manager/admin approval reassigns.
--   * new task_events types keep the audit trail complete.
--
-- Profile ownership is untouched: profile_id on a task is context, never
-- ownership. Moving a task never moves a lead or a profile.

alter table assigned_tasks drop constraint if exists assigned_tasks_status_check;
alter table assigned_tasks add constraint assigned_tasks_status_check
  check (status in ('OPEN', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED'));

alter table assigned_tasks add column if not exists waiting_on text
  check (waiting_on is null or waiting_on in ('ADMIN', 'REP', 'CLIENT', 'EXTERNAL'));

alter table assigned_tasks add column if not exists transfer_requested_by uuid references reps(id) on delete set null;
alter table assigned_tasks add column if not exists transfer_requested_to uuid references reps(id) on delete set null;
alter table assigned_tasks add column if not exists transfer_reason text;

-- Restore-to-primary scans profile-bound open work; keep that read bounded.
create index if not exists assigned_tasks_profile_status_idx
  on assigned_tasks (profile_id, status)
  where profile_id is not null;

alter table task_events drop constraint if exists task_events_event_type_check;
alter table task_events add constraint task_events_event_type_check
  check (event_type in (
    'TASK_CREATED',
    'TASK_ASSIGNED',
    'TASK_REASSIGNED',
    'TASK_STARTED',
    'TASK_COMPLETED',
    'TASK_CANCELLED',
    'TASK_RESCHEDULED',
    'TASK_WAITING',
    'TASK_REOPENED',
    'TASK_TRANSFER_REQUESTED',
    'TASK_TRANSFER_APPROVED',
    'TASK_TRANSFER_CANCELLED'
  ));
