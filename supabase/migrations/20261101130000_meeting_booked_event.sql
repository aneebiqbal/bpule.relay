-- Canonical meeting truth: a booked meeting is a MEETING_BOOKED action event,
-- not a CLIENT_WON. The app read MEETING_BOOKED in several places but the
-- constraint rejected it, so every meeting count read 0 (and the status route
-- recorded meetings as wins). See src/lib/sales/meetings.ts.
--
-- Keep in lockstep with ActionEventType in src/lib/action-ledger.ts
-- (tests/action-ledger-schema-parity.test.ts).

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
    'MEETING_BOOKED',
    'CLIENT_WON',
    'LEAD_ARCHIVED',
    'RECOMMENDATION_SHOWN',
    'RECOMMENDATION_ACTED'
  ));
