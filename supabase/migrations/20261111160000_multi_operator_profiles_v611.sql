-- RELAY V6.1.1 — Multi-operator profiles.
--
-- ONE profile → ONE permanent PRIMARY owner → ZERO OR MORE active OPERATORS.
-- An operator is a permanent, ongoing, executable contributor: the primary
-- keeps ownership, the operator works the same channel plan, and the plan is
-- counted once. BACKUP stays eligibility-only and never executes.
--
-- The daily plan was already channel-owned (V6.1); this migration only widens
-- the responsibility roles and the acknowledgement subject. Nothing is
-- backfilled: operators are new rows, and existing chains stay exactly as they
-- are.

-- ---------------------------------------------------------------------------
-- 1. profile_coverage gains the OPERATOR role
-- ---------------------------------------------------------------------------

alter table profile_coverage drop constraint if exists profile_coverage_role_check;
alter table profile_coverage add constraint profile_coverage_role_check
  check (role in ('PRIMARY', 'BACKUP', 'OPERATOR'));

comment on column profile_coverage.role is
  'PRIMARY owns the profile of record; OPERATOR is an active, executable contributor who shares the channel plan; BACKUP is eligibility only and never executes.';

-- pc_active_rep_uniq (profile_id, rep_id) where active already guarantees a rep
-- holds at most one role per profile, and pc_one_primary_idx guarantees exactly
-- one active PRIMARY. OPERATOR rows need no new index.

-- ---------------------------------------------------------------------------
-- 2. Acknowledgement subject gains OPERATOR
-- ---------------------------------------------------------------------------

alter table responsibility_acknowledgements
  drop constraint if exists responsibility_acknowledgements_subject_check;
alter table responsibility_acknowledgements
  add constraint responsibility_acknowledgements_subject_check
  check (subject in ('PRIMARY', 'COVERAGE', 'OPERATOR'));

-- One acknowledgement per (profile, rep) for a permanent operator seat. The
-- existing ack_primary_uniq only covers subject = 'PRIMARY'.
create unique index if not exists ack_operator_uniq
  on responsibility_acknowledgements (organization_id, profile_id, rep_id)
  where subject = 'OPERATOR';

-- ---------------------------------------------------------------------------
-- 3. Coverage events gain the operator audit types
-- ---------------------------------------------------------------------------

alter table coverage_events drop constraint if exists coverage_events_event_type_check;
alter table coverage_events add constraint coverage_events_event_type_check
  check (event_type in (
    'COVERAGE_ACTIVATED',
    'COVERAGE_EXPIRED',
    'COVERAGE_REVOKED',
    'COVERAGE_RESTORED',
    'COVERAGE_COMPLETED',
    'BACKUP_CONFIGURED',
    'COVERAGE_ASSIGNED',
    'COVERAGE_TRANSFERRED',
    'OPERATOR_ADDED',
    'OPERATOR_REMOVED'
  ));

comment on table profile_coverage is
  'Ordered responsibility configuration per sending profile. PRIMARY is the owner of record; OPERATOR rows are active contributors who execute the same channel plan; BACKUP rows are the ordered fallback chain. Eligibility is still proven by identity_assignments.';
