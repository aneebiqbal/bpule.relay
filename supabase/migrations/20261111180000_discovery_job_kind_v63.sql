-- RELAY V6.3 — provider discovery joins the existing scheduler outbox.
--
-- `operational_jobs` is the ONE job authority; discovery is a new job kind, not a
-- new scheduler and not node-cron (§12).

alter table operational_jobs drop constraint if exists operational_jobs_job_kind_check;
alter table operational_jobs add constraint operational_jobs_job_kind_check
  check (job_kind in (
    'OPEN_DAY',
    'EVALUATE_REP_DAY',
    'EMIT_WARNING',
    'EMIT_ESCALATION',
    'CLOSE_MISSED_DAY',
    'PREPARE_CARRYOVER',
    'EVALUATE_FOLLOWUP',
    'ENQUEUE_EMAIL',
    'SYNC_MAILBOX',
    'SEND_EMAIL',
    'SEND_FOLLOWUP',
    'PROCESS_INBOUND_EMAIL',
    'RETRY_EMAIL',
    'DISCOVER_PROSPECTS'
  ));

comment on constraint operational_jobs_job_kind_check on operational_jobs is
  'DISCOVER_PROSPECTS drains the provider saved-search cursors through the same outbox and claim model as every other job.';
