-- RELAY V6.3 — discovery events join the canonical action ledger.
--
-- `action_events` is the ONE append-only ledger of what the product did. These
-- are real product events (a candidate was discovered, qualified, enriched);
-- the provider API calls themselves stay in provider_telemetry (§29).

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
    'EMAIL_REPLY_RECEIVED'
  ));

comment on constraint action_events_action_type_check on action_events is
  'Discovery emits PROSPECT_DISCOVERED / PROSPECT_QUALIFIED / EMAIL_ENRICHED / EMAIL_VERIFIED. EMAIL_SENT and EMAIL_REPLY_RECEIVED are reserved for the real email execution path (§19) — a generated draft never emits them.';
