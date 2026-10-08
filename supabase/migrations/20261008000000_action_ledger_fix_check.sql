-- Fix: REPLY_SENT and LEAD_ARCHIVED were emitted by code but missing from CHECK constraint
-- causing silent insert failures for outbound replies and auto-archivals.

alter table action_events
  drop constraint if exists action_events_action_type_check;

alter table action_events
  add constraint action_events_action_type_check
  check (action_type in (
    'LEAD_EXTRACTED',
    'CONNECTION_PREPARED',
    'CONNECTION_SENT',
    'DM_PREPARED',
    'DM_SENT',
    'FOLLOWUP_SENT',
    'REPLY_SENT',
    'REPLY_RECEIVED',
    'LEAD_REFERRED',
    'PROFILE_RECOMMENDED',
    'UPWORK_JOB_EXTRACTED',
    'UPWORK_PROPOSAL_PREPARED',
    'UPWORK_APPLIED',
    'OPPORTUNITY_CREATED',
    'CLIENT_WON',
    'LEAD_ARCHIVED'
  ));
