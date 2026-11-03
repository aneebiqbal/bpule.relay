-- Production-shaped extras for the Phase 8 activation migrations. ISOLATED
-- DATABASE ONLY. Load AFTER operations_workspace_rls_fixture.sql.
--
-- Shapes copied from the read-only production schema dump (2026-11-01):
-- - notifications: the 0088 shape, RLS NOT enabled, ALL granted to anon and
--   authenticated (the exposure 20261101135000 closes).
-- - messages: the columns the preview view reads, RLS by organization.
-- - action_events_action_type_check: production's list (no MEETING_BOOKED).

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid references reps(id) on delete cascade,
  type text not null,
  title text,
  message text,
  metadata jsonb default '{}'::jsonb,
  read boolean default false,
  created_at timestamptz default now()
);
grant all on notifications to anon, authenticated;

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  lead_id uuid not null,
  type text not null default 'dm',
  direction text not null default 'outbound',
  sent_text text,
  sent_at timestamptz,
  thread_status text not null default 'UNVERIFIED'
);
alter table messages enable row level security;
drop policy if exists messages_select on messages;
create policy messages_select on messages for select to authenticated using (organization_id = current_org_id());
create index if not exists messages_lead_idx on messages (lead_id);

alter table action_events drop constraint if exists action_events_action_type_check;
alter table action_events add constraint action_events_action_type_check check (action_type in (
  'LEAD_EXTRACTED', 'CONNECTION_PREPARED', 'CONNECTION_SENT', 'DM_PREPARED', 'DM_SENT', 'FOLLOWUP_SENT',
  'REPLY_SENT', 'REPLY_RECEIVED', 'LEAD_REFERRED', 'PROFILE_RECOMMENDED', 'UPWORK_JOB_EXTRACTED',
  'UPWORK_PROPOSAL_PREPARED', 'UPWORK_APPLIED', 'OPPORTUNITY_CREATED', 'CLIENT_WON', 'LEAD_ARCHIVED',
  'RECOMMENDATION_SHOWN', 'RECOMMENDATION_ACTED'
));
