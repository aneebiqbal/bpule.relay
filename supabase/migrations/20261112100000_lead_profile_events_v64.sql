-- RELAY V6.4 — lead profile attribution changes join the canonical ledger.
--
-- `action_events` is the ONE append-only record of what the product did. A
-- profile assignment or change is a real product event with an before/after,
-- so it belongs here rather than in a parallel history table.

alter table action_events drop constraint if exists action_events_action_type_check;
alter table action_events add constraint action_events_action_type_check
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
    'UPWORK_JOB_SAVED',
    'UPWORK_PROPOSAL_PREPARED',
    'UPWORK_APPLIED',
    'UPWORK_APPLICATION_SUBMITTED',
    'UPWORK_FOLLOWUP_SENT',
    'UPWORK_CLIENT_REPLIED',
    'UPWORK_INTERVIEW',
    'UPWORK_WON',
    'UPWORK_LOST',
    'UPWORK_ARCHIVED',
    'UPWORK_DELETED',
    'OPPORTUNITY_CREATED',
    'MEETING_BOOKED',
    'CLIENT_WON',
    'LEAD_ARCHIVED',
    'RECOMMENDATION_SHOWN',
    'RECOMMENDATION_ACTED',
    'PROSPECT_DISCOVERED',
    'PROSPECT_QUALIFIED',
    'EMAIL_ENRICHED',
    'EMAIL_VERIFIED',
    'EMAIL_SENT',
    'LEAD_PROFILE_ASSIGNED',
    'LEAD_PROFILE_CHANGED'
  ));

comment on constraint action_events_action_type_check on action_events is
  'LEAD_PROFILE_ASSIGNED / LEAD_PROFILE_CHANGED record a lead''s channel-identity attribution. They are internal attribution events, not rep activity, so they are excluded from the activity registry.';
