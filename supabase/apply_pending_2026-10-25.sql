-- ============================================================================
-- RELAY — PENDING MIGRATIONS (run in this exact order on the Supabase project)
-- Generated 2026-10-25 from supabase/migrations/. Safe to re-run.
-- Uses only Supabase-provided objects: current_org_id(), is_org_admin(),
-- auth.uid(), the `authenticated` role, gen_random_uuid().
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. 20261024120000_intelligence_sample_events_rls
--     P0 security: enable RLS on intelligence_sample_events and add the org
--     boundary (the policies existed but RLS was never enabled).
-- ────────────────────────────────────────────────────────────────────────────

alter table intelligence_sample_events add column if not exists organization_id uuid;

update intelligence_sample_events e
  set organization_id = s.organization_id
  from intelligence_samples s
  where e.sample_id = s.id
    and e.organization_id is null;

create index if not exists int_sample_events_org_idx
  on intelligence_sample_events (organization_id);

create or replace function public.set_intelligence_sample_event_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    select organization_id into new.organization_id
      from intelligence_samples where id = new.sample_id;
  end if;
  return new;
end;
$$;

drop trigger if exists int_sample_events_set_org on intelligence_sample_events;
create trigger int_sample_events_set_org
  before insert on intelligence_sample_events
  for each row execute function public.set_intelligence_sample_event_org();

alter table intelligence_sample_events enable row level security;

drop policy if exists "int_events_org_read" on intelligence_sample_events;
drop policy if exists "int_events_org_insert" on intelligence_sample_events;

create policy int_events_org_read on intelligence_sample_events
  for select to authenticated
  using (organization_id = current_org_id());

create policy int_events_org_insert on intelligence_sample_events
  for insert to authenticated
  with check (organization_id = current_org_id());


-- ────────────────────────────────────────────────────────────────────────────
-- 2. 20261024120001_followup_trigger_canonical
--     Align the follow-up notification trigger with the app's canonical policy
--     (3 calendar days for the first follow-up; the queue owns the 3/6/6 cadence).
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.check_followup_eligible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notification_log (rep_id, type, payload)
  select
    l.owner_rep_id,
    'followup_eligible',
    jsonb_build_object('lead_id', new.lead_id, 'sent_at', new.sent_at)
  from leads l
  where l.id = new.lead_id
    and l.status = 'contacted'
    and not exists (
      select 1 from outcomes o
      where o.lead_id = new.lead_id and o.stage = 'replied'
    )
    and (new.sent_at + interval '3 days') <= now();
  return new;
end;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. 20261024120002_sender_context
--     Persist full sender context on messages (revenue identity + attribution).
-- ────────────────────────────────────────────────────────────────────────────

alter table messages add column if not exists revenue_identity_id uuid;
alter table messages add column if not exists sender_attribution_status text not null default 'UNKNOWN';

create index if not exists messages_revenue_identity_idx on messages (revenue_identity_id);

update messages set sender_attribution_status = 'KNOWN' where sender_profile_id is not null;

comment on column messages.revenue_identity_id is 'Revenue identity (workspace profile) that owns the sender side of this message.';
comment on column messages.sender_attribution_status is 'KNOWN when the sender was captured, UNKNOWN when it was not. Never INFERRED: identity is never guessed.';


-- ────────────────────────────────────────────────────────────────────────────
-- 4. 20261024120003_conversation_facts
--     Persist extracted conversation facts (budget, meeting date, proposal, ...).
-- ────────────────────────────────────────────────────────────────────────────

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


-- ────────────────────────────────────────────────────────────────────────────
-- 5. 20261024120004_thread_status
--     Mark inbound messages whose sender identity was never verified.
-- ────────────────────────────────────────────────────────────────────────────

alter table messages add column if not exists thread_status text not null default 'UNVERIFIED';
comment on column messages.thread_status is 'VERIFIED when the sender identity was checked against the lead, UNVERIFIED when it was not.';


-- ────────────────────────────────────────────────────────────────────────────
-- 6. 20261024120005_security_definer_hardening
--     append_sample_event / approve_sample_for_training were callable by any
--     authenticated user with no org/reviewer check.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.append_sample_event(
  p_sample_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_actor uuid default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  event_id uuid;
begin
  if not exists (
    select 1 from intelligence_samples s
    where s.id = p_sample_id and s.organization_id = current_org_id()
  ) then
    raise exception 'sample not found in the caller organisation';
  end if;

  if p_idempotency_key is not null then
    select id into event_id
      from intelligence_sample_events
      where idempotency_key = p_idempotency_key;

    if event_id is not null then
      return event_id;
    end if;
  end if;

  insert into intelligence_sample_events (sample_id, event_type, payload, actor, idempotency_key)
  values (p_sample_id, p_event_type, p_payload, p_actor, p_idempotency_key)
  returning id into event_id;

  return event_id;
end;
$$;

create or replace function public.approve_sample_for_training(
  p_sample_id uuid,
  p_approver_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_org_admin() then
    raise exception 'organisation admin required';
  end if;
  if not exists (
    select 1 from intelligence_samples s
    where s.id = p_sample_id and s.organization_id = current_org_id()
  ) then
    raise exception 'sample not found in the caller organisation';
  end if;

  update intelligence_samples
  set training_approved = true,
      approved_by = p_approver_id,
      approved_at = now(),
      label_status = 'HUMAN_REVIEWED',
      review_status = 'approved',
      reviewed_by = p_approver_id,
      reviewed_at = now()
  where id = p_sample_id;
end;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- 7. 20261025120001_security_definer_hardening_2
--     append_rescore_event took only a lead id and could overwrite any org's
--     lead via /rpc.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.append_rescore_event(
  p_lead_id uuid,
  p_canonical_score int,
  p_score_version text,
  p_score_breakdown jsonb,
  p_rescore_event jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update leads
  set
    canonical_score = p_canonical_score,
    score_version = p_score_version,
    scored_at = now(),
    score_breakdown = p_score_breakdown,
    rescore_events = array_append(coalesce(rescore_events, '{}'), p_rescore_event)
  where id = p_lead_id
    and organization_id = current_org_id();
end;
$$;

comment on function public.append_rescore_event(uuid, int, text, jsonb, jsonb) is
  'Appends a canonical rescore event and updates the lead score. Scoped to the caller''s organisation.';


-- ────────────────────────────────────────────────────────────────────────────
-- 8. 20261025120002_review_evaluations
--     Human evaluation tables (message, thesis, routing), org-scoped with RLS.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists message_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  message_id uuid not null,
  reviewer_rep_id uuid not null,
  score int not null check (score between 1 and 5),
  classification text not null check (classification in (
    'SALES_READY', 'GENERIC', 'MARKETING_NOT_SALES', 'UNSUPPORTED', 'FABRICATED', 'WRONG_STAGE'
  )),
  dimensions jsonb not null default '{}'::jsonb,
  reasons text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  unique (organization_id, message_id, reviewer_rep_id)
);
create index if not exists message_evals_org_idx on message_evaluations (organization_id, created_at desc);

create table if not exists thesis_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  reviewer_rep_id uuid not null,
  rating text not null check (rating in ('STRONG', 'USEFUL', 'WEAK', 'MISLEADING')),
  reasons text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  unique (organization_id, lead_id, reviewer_rep_id)
);
create index if not exists thesis_evals_org_idx on thesis_evaluations (organization_id, created_at desc);

create table if not exists routing_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  reviewer_rep_id uuid not null,
  best_sender_profile_id uuid,
  v1_correct boolean,
  v2_correct boolean,
  created_at timestamptz not null default now(),
  unique (organization_id, lead_id, reviewer_rep_id)
);
create index if not exists routing_evals_org_idx on routing_evaluations (organization_id, created_at desc);

alter table message_evaluations enable row level security;
alter table thesis_evaluations enable row level security;
alter table routing_evaluations enable row level security;

create policy message_evals_org_read on message_evaluations for select to authenticated using (organization_id = current_org_id());
create policy message_evals_org_insert on message_evaluations for insert to authenticated with check (organization_id = current_org_id());
create policy thesis_evals_org_read on thesis_evaluations for select to authenticated using (organization_id = current_org_id());
create policy thesis_evals_org_insert on thesis_evaluations for insert to authenticated with check (organization_id = current_org_id());
create policy routing_evals_org_read on routing_evaluations for select to authenticated using (organization_id = current_org_id());
create policy routing_evals_org_insert on routing_evaluations for insert to authenticated with check (organization_id = current_org_id());


-- ============================================================================
-- VERIFY (run after applying)
-- ============================================================================
-- select column_name from information_schema.columns
--   where table_name = 'messages'
--     and column_name in ('revenue_identity_id','sender_attribution_status','thread_status');
--
-- select column_name from information_schema.columns
--   where table_name = 'intelligence_sample_events' and column_name = 'organization_id';
--
-- select relname, relrowsecurity from pg_class
--   where relname in ('intelligence_sample_events','conversation_facts',
--                     'message_evaluations','thesis_evaluations','routing_evaluations');
--
-- select tgname from pg_trigger where tgname = 'int_sample_events_set_org';
-- ============================================================================
