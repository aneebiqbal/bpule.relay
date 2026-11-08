-- RELAY V4 — Task UX closure: waiting note + declined transfer audit.
-- Additive only.

alter table assigned_tasks add column if not exists waiting_note text;

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
    'TASK_TRANSFER_DECLINED',
    'TASK_TRANSFER_CANCELLED'
  ));
