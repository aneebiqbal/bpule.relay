-- B14: persist extracted conversation facts so a stated budget, meeting date
-- or proposal request is queryable instead of trapped in message text.
-- Each fact keeps its source message, quote, confidence and timestamp.

create table if not exists conversation_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  message_id uuid,
  kind text not null check (kind in (
    'budget', 'meeting_date', 'deliverable', 'timeline', 'decision_maker',
    'procurement_step', 'nda', 'proposal_request', 'objection', 'deferral_date'
  )),
  value text not null,
  quote text not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  captured_at timestamptz not null default now()
);

create index if not exists conversation_facts_lead_idx on conversation_facts (lead_id, captured_at desc);
create index if not exists conversation_facts_org_idx on conversation_facts (organization_id);

alter table conversation_facts enable row level security;

drop policy if exists conversation_facts_org_read on conversation_facts;
create policy conversation_facts_org_read on conversation_facts
  for select to authenticated
  using (organization_id = current_org_id());

drop policy if exists conversation_facts_org_insert on conversation_facts;
create policy conversation_facts_org_insert on conversation_facts
  for insert to authenticated
  with check (organization_id = current_org_id());
