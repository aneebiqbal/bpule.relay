-- Responsibility assignment emits its own audit events.
--
-- `assignment.ts` records COVERAGE_ASSIGNED / COVERAGE_TRANSFERRED so the audit
-- trail distinguishes "this rep was given the channel" from "this rep is
-- temporarily covering it". The original CHECK only allowed the temporary
-- coverage lifecycle values, so every responsibility write failed with a
-- constraint violation and surfaced as "Failed to assign responsibility.".

alter table public.coverage_events drop constraint if exists coverage_events_event_type_check;

alter table public.coverage_events
  add constraint coverage_events_event_type_check
  check (
    event_type in (
      'COVERAGE_ACTIVATED',
      'COVERAGE_EXPIRED',
      'COVERAGE_REVOKED',
      'COVERAGE_RESTORED',
      'COVERAGE_COMPLETED',
      'BACKUP_CONFIGURED',
      'COVERAGE_ASSIGNED',
      'COVERAGE_TRANSFERRED'
    )
  );
