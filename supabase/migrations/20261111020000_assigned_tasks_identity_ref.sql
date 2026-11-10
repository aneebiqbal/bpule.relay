-- assigned_tasks reference model.
--
-- `profile_id` is the canonical PERSON profile (profiles.id) — used by the
-- profile operating centre, coverage handoff/restore and the task filter.
-- Channel execution context is a separate column, `revenue_identity_id`
-- (revenue_identities.id), written by the Leads/Inbox surfaces.
--
-- One UUID must never mean "person" at one call site and "channel identity"
-- at another. Production already carries these columns (applied out of band);
-- this migration makes a fresh database built from the repo match.

alter table assigned_tasks add column if not exists job_id uuid
  references upwork_jobs(id) on delete cascade;

alter table assigned_tasks add column if not exists revenue_identity_id uuid;

create index if not exists assigned_tasks_job_idx
  on assigned_tasks (job_id)
  where job_id is not null;

create index if not exists assigned_tasks_identity_idx
  on assigned_tasks (revenue_identity_id)
  where revenue_identity_id is not null;

alter table assigned_tasks drop constraint if exists assigned_tasks_kind_check;
alter table assigned_tasks add constraint assigned_tasks_kind_check
  check (kind in (
    'ADMIN', 'REVIEW', 'CALL', 'RESEARCH', 'PREPARE_PROPOSAL',
    'CUSTOM', 'REQUEST_UPDATE', 'FOLLOW_UP'
  ));
