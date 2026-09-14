-- 0036: Relay Revenue Intelligence System
--
-- Extends the outreach engine with:
-- profile_assignments: BD user -> outreach profile assignments
-- proof_cards: structured proof extracted from profile sources
-- conversation_states: track lead conversation stages
-- sales_memory: remember what was sent, angles used, outcomes
-- edit_learning: capture BD edits to AI copy for learning

-- ── Profile Assignments ─────────────────────────────────────────────────────
-- A BD user (rep) can be assigned multiple outreach profiles.
-- One BD user may send as multiple identities.
create table if not exists profile_assignments (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references reps(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (rep_id, profile_id)
);

create index if not exists profile_assignments_rep_idx on profile_assignments (rep_id);
create index if not exists profile_assignments_profile_idx on profile_assignments (profile_id);

alter table profile_assignments enable row level security;

drop policy if exists "profile_assignments_select" on profile_assignments;
create policy "profile_assignments_select" on profile_assignments
  for select using (
    rep_id = public.current_rep_id()
    or public.is_admin()
    or exists (select 1 from reps r where r.id = public.current_rep_id() and r.role = 'admin')
  );

drop policy if exists "profile_assignments_insert" on profile_assignments;
create policy "profile_assignments_insert" on profile_assignments
  for insert with check (
    rep_id = public.current_rep_id()
    or public.is_admin()
  );

drop policy if exists "profile_assignments_delete" on profile_assignments;
create policy "profile_assignments_delete" on profile_assignments
  for delete using (
    rep_id = public.current_rep_id()
    or public.is_admin()
  );

-- ── Proof Cards ─────────────────────────────────────────────────────────────
-- Structured proof extracted from profile sources (CV, portfolio, etc).
-- Each card represents a verified claim the sender can make.
create table if not exists proof_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,

  -- What this proof demonstrates
  capability text not null,
  -- Strength of the proof: strong, moderate, weak
  strength text not null default 'moderate' check (strength in ('strong', 'moderate', 'weak')),
  -- The safe claim to make in outreach
  safe_claim text not null,
  -- Source of the proof: cv, project, portfolio, case_study, certification, client_work
  source_type text not null check (source_type in ('cv', 'project', 'portfolio', 'case_study', 'certification', 'client_work', 'approved_fact')),
  -- Source reference (URL, project name, etc)
  source_reference text,
  -- Tags for matching to leads
  tags text[] not null default '{}',
  -- Whether this proof has been verified/approved
  verified boolean not null default false,
  -- Forbidden claims (what NOT to say)
  forbidden_claims text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proof_cards_profile_idx on proof_cards (profile_id);
create index if not exists proof_cards_tags_idx on proof_cards using gin (tags);
create index if not exists proof_cards_org_idx on proof_cards (organization_id);

alter table proof_cards enable row level security;

drop policy if exists "proof_cards_select" on proof_cards;
create policy "proof_cards_select" on proof_cards
  for select using (organization_id = current_org_id());

drop policy if exists "proof_cards_insert" on proof_cards;
create policy "proof_cards_insert" on proof_cards
  for insert with check (organization_id = current_org_id());

drop policy if exists "proof_cards_update" on proof_cards;
create policy "proof_cards_update" on proof_cards
  for update using (organization_id = current_org_id());

drop policy if exists "proof_cards_delete" on proof_cards;
create policy "proof_cards_delete" on proof_cards
  for delete using (organization_id = current_org_id());

-- ── Conversation States ─────────────────────────────────────────────────────
-- Track the conversation stage for each lead beyond basic status.
create table if not exists conversation_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade unique,

  -- Conversation stage
  stage text not null default 'new' check (stage in (
    'new', 'contacted', 'replied', 'qualifying', 'interested',
    'meeting', 'proposal', 'negotiation', 'won', 'lost'
  )),

  -- What was sent and when
  last_sent_at timestamptz,
  last_sent_message_id uuid references messages(id) on delete set null,
  last_reply_at timestamptz,

  -- Sender profile used
  sender_profile_id uuid references profiles(id) on delete set null,

  -- Strategy used for the last outreach
  last_strategy text,
  last_angle text,
  last_cta text,

  -- Follow-up tracking
  followup_count integer not null default 0,
  next_followup_at timestamptz,

  -- Outcome tracking
  won_at timestamptz,
  lost_at timestamptz,
  lost_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversation_states_lead_idx on conversation_states (lead_id);
create index if not exists conversation_states_stage_idx on conversation_states (organization_id, stage);
create index if not exists conversation_states_sender_idx on conversation_states (sender_profile_id);

alter table conversation_states enable row level security;

drop policy if exists "conversation_states_select" on conversation_states;
create policy "conversation_states_select" on conversation_states
  for select using (organization_id = current_org_id());

drop policy if exists "conversation_states_insert" on conversation_states;
create policy "conversation_states_insert" on conversation_states
  for insert with check (organization_id = current_org_id());

drop policy if exists "conversation_states_update" on conversation_states;
create policy "conversation_states_update" on conversation_states
  for update using (organization_id = current_org_id());

-- ── Sales Memory ────────────────────────────────────────────────────────────
-- Remember what approaches work for different lead types, industries, etc.
create table if not exists sales_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  -- What this memory is about
  memory_type text not null check (memory_type in (
    'angle_used', 'proof_used', 'cta_used', 'objection_seen',
    'won_reason', 'lost_reason', 'edit_pattern', 'channel_preference',
    'industry_fit', 'lead_type_fit'
  )),

  -- The content of the memory
  content text not null,

  -- Context
  lead_id uuid references leads(id) on delete set null,
  profile_id uuid references profiles(id) on delete set null,
  industry text,
  lead_type text,
  channel text,
  stage text,

  -- Outcome
  outcome text check (outcome in ('positive', 'negative', 'neutral', null)),
  -- How many times this pattern has been observed
  occurrence_count integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_memory_type_idx on sales_memory (organization_id, memory_type);
create index if not exists sales_memory_profile_idx on sales_memory (profile_id);
create index if not exists sales_memory_lead_idx on sales_memory (lead_id);

alter table sales_memory enable row level security;

drop policy if exists "sales_memory_select" on sales_memory;
create policy "sales_memory_select" on sales_memory
  for select using (organization_id = current_org_id());

drop policy if exists "sales_memory_insert" on sales_memory;
create policy "sales_memory_insert" on sales_memory
  for insert with check (organization_id = current_org_id());

drop policy if exists "sales_memory_update" on sales_memory;
create policy "sales_memory_update" on sales_memory
  for update using (organization_id = current_org_id());

drop policy if exists "sales_memory_delete" on sales_memory;
create policy "sales_memory_delete" on sales_memory
  for delete using (organization_id = current_org_id());

-- ── Edit Learning ───────────────────────────────────────────────────────────
-- Capture BD edits to AI copy for learning preferences.
create table if not exists edit_learning (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,

  -- Original AI text
  original_text text not null,
  -- What BD actually sent
  edited_text text not null,

  -- Computed signals
  edit_distance integer,
  length_delta integer,
  greeting_changed boolean not null default false,
  cta_changed boolean not null default false,
  proof_removed boolean not null default false,
  made_shorter boolean not null default false,
  made_longer boolean not null default false,
  formality_shift text check (formality_shift in ('more_formal', 'less_formal', 'same', null)),

  created_at timestamptz not null default now()
);

create index if not exists edit_learning_rep_idx on edit_learning (rep_id);
create index if not exists edit_learning_message_idx on edit_learning (message_id);

alter table edit_learning enable row level security;

drop policy if exists "edit_learning_select" on edit_learning;
create policy "edit_learning_select" on edit_learning
  for select using (organization_id = current_org_id());

drop policy if exists "edit_learning_insert" on edit_learning;
create policy "edit_learning_insert" on edit_learning
  for insert with check (organization_id = current_org_id());

-- ── Extend leads with sender_profile_id ─────────────────────────────────────
-- Track which outreach profile was used for the lead.
do $$ begin
  if to_regclass('public.leads') is not null then
    alter table leads add column if not exists sender_profile_id uuid references profiles(id) on delete set null;
  end if;
end $$;

create index if not exists leads_sender_profile_idx on leads (sender_profile_id);

-- ── Extend messages with strategy and sender info ───────────────────────────
do $$ begin
  if to_regclass('public.messages') is not null then
    alter table messages add column if not exists sender_profile_id uuid references profiles(id) on delete set null;
    alter table messages add column if not exists strategy text;
    alter table messages add column if not exists angle text;
    alter table messages add column if not exists cta_type text;
  end if;
end $$;

create index if not exists messages_sender_profile_idx on messages (sender_profile_id);
