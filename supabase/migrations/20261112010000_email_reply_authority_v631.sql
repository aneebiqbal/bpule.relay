-- RELAY V6.3.1 — one email reply authority.
--
-- Inbound email uses the canonical REPLY_RECEIVED with channel='email'. The
-- reserved EMAIL_REPLY_RECEIVED type was never emitted and is removed so there
-- is exactly one authority for an inbound reply.

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
    'EMAIL_SENT'
  ));

comment on constraint action_events_action_type_check on action_events is
  'Inbound email uses REPLY_RECEIVED + channel=email; EMAIL_REPLY_RECEIVED is not an authority.';
