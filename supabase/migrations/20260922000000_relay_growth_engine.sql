-- 20260922: Relay Growth Engine — product memory, editorial system, content operations
--
-- V1 tables for the autonomous editorial strategist:
--   1. relay_growth_memory      — durable product/editorial memory
--   2. relay_growth_events      — product change feed (build log)
--   3. relay_content_opportunities — daily generated content opportunities
--   4. relay_editorial_decisions — daily editor selections
--   5. relay_growth_drafts      — growth-specific content drafts
--   6. relay_content_publications — approved/published content
--   7. relay_content_outcomes   — performance metrics per publication
--   8. relay_growth_experiments — A/B content experiments
--
-- All tables are tenant-scoped via organization_id with RLS consistent
-- with existing content tables (migration 0018+).

-- ============================================================================
-- RELAY GROWTH MEMORY
-- Durable product/editorial memory that understands what Relay actually is.
-- ============================================================================

create table if not exists relay_growth_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  -- Memory classification
  memory_type text not null check (memory_type in (
    'product_fact', 'product_decision', 'experiment_result',
    'customer_problem', 'design_decision', 'engineering_lesson',
    'revenue_learning', 'dogfood_result', 'market_insight',
    'content_insight', 'audience_insight', 'competitive_insight'
  )),

  -- Memory content
  title text not null,
  content text not null,
  source text,  -- where this memory came from (build_log, manual, api, etc.)

  -- Claim safety (reuses existing ClaimSafety enum)
  claim_safety text not null default 'VERIFIED_PROFILE_PROOF' check (claim_safety in (
    'VERIFIED_PROFILE_PROOF', 'APPROVED_CLAIM', 'INFERRED', 'UNSUPPORTED'
  )),

  -- Editorial metadata
  territories text[] not null default '{}',
  audience_segments text[] not null default '{}',

  -- Status
  active boolean not null default true,
  used_in_content boolean not null default false,

  -- Audit
  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rgm_org_idx on relay_growth_memory (organization_id);
create index if not exists rgm_org_type_idx on relay_growth_memory (organization_id, memory_type);
create index if not exists rgm_org_active_idx on relay_growth_memory (organization_id, active);
create index if not exists rgm_territories_idx on relay_growth_memory using gin (territories);
alter table relay_growth_memory enable row level security;

drop policy if exists "rgm_select" on relay_growth_memory;
create policy "rgm_select" on relay_growth_memory for select
  to authenticated using (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rgm_insert" on relay_growth_memory;
create policy "rgm_insert" on relay_growth_memory for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rgm_update" on relay_growth_memory;
create policy "rgm_update" on relay_growth_memory for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rgm_delete" on relay_growth_memory;
create policy "rgm_delete" on relay_growth_memory for delete
  to authenticated using (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- RELAY GROWTH EVENTS
-- Product change feed — raw events that can become content.
-- ============================================================================

create table if not exists relay_growth_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  event_type text not null check (event_type in (
    'product_change', 'product_decision', 'bug_discovered', 'bug_fixed',
    'experiment_started', 'experiment_result', 'customer_problem',
    'design_decision', 'engineering_lesson', 'revenue_learning',
    'dogfood_result', 'feature_shipped', 'feature_rejected',
    'assumption_invalidated', 'build_log_entry'
  )),

  title text not null,
  raw_content text not null,
  editorial_content text,  -- AI-extracted safe editorial version

  -- Processing status
  processed boolean not null default false,
  processed_at timestamptz,

  -- Source tracking
  source_kind text not null default 'build_log' check (source_kind in (
    'build_log', 'api', 'manual', 'system'
  )),
  source_id text,

  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists rge_org_idx on relay_growth_events (organization_id);
create index if not exists rge_org_type_idx on relay_growth_events (organization_id, event_type);
create index if not exists rge_org_processed_idx on relay_growth_events (organization_id, processed);
create index if not exists rge_created_idx on relay_growth_events (organization_id, created_at desc);
alter table relay_growth_events enable row level security;

drop policy if exists "rge_select" on relay_growth_events;
create policy "rge_select" on relay_growth_events for select
  to authenticated using (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rge_insert" on relay_growth_events;
create policy "rge_insert" on relay_growth_events for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rge_update" on relay_growth_events;
create policy "rge_update" on relay_growth_events for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- RELAY CONTENT OPPORTUNITIES
-- Daily generated content opportunities.
-- ============================================================================

create table if not exists relay_content_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  -- Opportunity source
  source_type text not null check (source_type in (
    'product_memory', 'product_event', 'territory_gap',
    'audience_need', 'market_event', 'experiment_result',
    'dogfood_result', 'content_gap'
  )),
  source_id uuid,  -- references the memory/event that generated this

  -- Opportunity content
  title text not null,
  observation text not null,
  insight text not null,
  territory text not null,
  audience_segment text not null,
  content_job text not null check (content_job in (
    'teach', 'challenge', 'show', 'prove', 'build_in_public',
    'start_conversation', 'create_category', 'explain_product', 'convert'
  )),

  -- Evidence and safety
  evidence_strength text not null default 'medium' check (evidence_strength in (
    'strong', 'medium', 'weak'
  )),
  claim_boundaries text[] not null default '{}',

  -- Scoring (deterministic, not fake virality)
  audience_relevance int not null default 50 check (audience_relevance between 0 and 100),
  novelty int not null default 50 check (novelty between 0 and 100),
  specificity int not null default 50 check (specificity between 0 and 100),
  timeliness int not null default 50 check (timeliness between 0 and 100),
  relay_differentiation int not null default 50 check (relay_differentiation between 0 and 100),
  conversation_potential int not null default 50 check (conversation_potential between 0 and 100),
  learning_value int not null default 50 check (learning_value between 0 and 100),
  repetition_risk int not null default 0 check (repetition_risk between 0 and 100),
  commercial_relevance int not null default 50 check (commercial_relevance between 0 and 100),

  -- Selection status
  selected boolean not null default false,
  selection_date date,
  rejected boolean not null default false,
  rejection_reason text,

  -- Generation metadata
  generated_at timestamptz not null default now(),
  generation_date date not null default current_date
);

create index if not exists rco_org_idx on relay_content_opportunities (organization_id);
create index if not exists rco_org_date_idx on relay_content_opportunities (organization_id, generation_date desc);
create index if not exists rco_org_selected_idx on relay_content_opportunities (organization_id, selected);
create index if not exists rco_org_territory_idx on relay_content_opportunities (organization_id, territory);
alter table relay_content_opportunities enable row level security;

drop policy if exists "rco_select" on relay_content_opportunities;
create policy "rco_select" on relay_content_opportunities for select
  to authenticated using (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rco_insert" on relay_content_opportunities;
create policy if not exists "rco_insert" on relay_content_opportunities for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rco_update" on relay_content_opportunities;
create policy if not exists "rco_update" on relay_content_opportunities for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- RELAY EDITORIAL DECISIONS
-- Daily editor selections — which opportunity was chosen and why.
-- ============================================================================

create table if not exists relay_editorial_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  decision_date date not null,
  opportunity_id uuid references relay_content_opportunities(id) on delete set null,

  -- Selection reasoning
  primary_reason text not null,
  audience_reason text not null,
  timeliness_reason text not null,
  evidence_reason text not null,
  takeaway text not null,

  -- Status
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'edited', 'rejected', 'regenerated', 'not_today'
  )),

  -- Admin feedback
  admin_feedback text check (admin_feedback in (
    'approved_unchanged', 'light_edit', 'heavy_edit',
    'rejected', 'not_today', 'wrong_topic', 'too_generic',
    'too_promotional', 'repetitive', 'weak_hook', 'fact_problem'
  )),
  admin_edits text,

  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists red_org_idx on relay_editorial_decisions (organization_id);
create index if not exists red_org_date_idx on relay_editorial_decisions (organization_id, decision_date desc);
alter table relay_editorial_decisions enable row level security;

drop policy if exists "red_select" on relay_editorial_decisions;
create policy "red_select" on relay_editorial_decisions for select
  to authenticated using (organization_id = current_org_id() and is_org_admin());

drop policy if exists "red_insert" on relay_editorial_decisions;
create policy "red_insert" on relay_editorial_decisions for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "red_update" on relay_editorial_decisions;
create policy "red_update" on relay_editorial_decisions for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- RELAY GROWTH DRAFTS
-- Growth-specific content drafts linked to editorial decisions.
-- ============================================================================

create table if not exists relay_growth_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  decision_id uuid references relay_editorial_decisions(id) on delete set null,
  opportunity_id uuid references relay_content_opportunities(id) on delete set null,

  -- Post plan (structured before writing)
  post_plan jsonb not null default '{}'::jsonb,

  -- Draft content
  platform text not null default 'linkedin' check (platform in ('linkedin', 'x', 'instagram')),
  caption text not null default '',
  hook text,

  -- Visual decision
  visual_type text check (visual_type in (
    'none', 'image', 'carousel', 'short_video_script',
    'build_log', 'screenshot_story', 'data_post'
  )),
  visual_concept text,
  visual_prompt text,

  -- Status
  status text not null default 'draft' check (status in (
    'draft', 'ready', 'approved', 'published', 'rejected'
  )),

  -- Quality
  quality_score int check (quality_score between 0 and 100),
  quality_notes text[],

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rgd_org_idx on relay_growth_drafts (organization_id);
create index if not exists rgd_org_status_idx on relay_growth_drafts (organization_id, status);
create index if not exists rgd_decision_idx on relay_growth_drafts (decision_id);
alter table relay_growth_drafts enable row level security;

drop policy if exists "rgd_select" on relay_growth_drafts;
create policy "rgd_select" on relay_growth_drafts for select
  to authenticated using (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rgd_insert" on relay_growth_drafts;
create policy "rgd_insert" on relay_growth_drafts for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rgd_update" on relay_growth_drafts;
create policy "rgd_update" on relay_growth_drafts for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- RELAY CONTENT PUBLICATIONS
-- Approved and published content with attribution.
-- ============================================================================

create table if not exists relay_content_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  draft_id uuid references relay_growth_drafts(id) on delete set null,

  -- Publication metadata
  platform text not null,
  published_at timestamptz,
  external_id text,  -- platform post ID
  external_url text,

  -- Attribution
  campaign text,
  utm_source text,
  utm_medium text,
  utm_content text,

  -- Content snapshot
  caption text not null,
  territory text not null,
  audience_segment text not null,
  content_job text not null,

  created_at timestamptz not null default now()
);

create index if not exists rcp_org_idx on relay_content_publications (organization_id);
create index if not exists rcp_org_date_idx on relay_content_publications (organization_id, published_at desc);
create index if not exists rcp_org_territory_idx on relay_content_publications (organization_id, territory);
alter table relay_content_publications enable row level security;

drop policy if exists "rcp_select" on relay_content_publications;
create policy "rcp_select" on relay_content_publications for select
  to authenticated using (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rcp_insert" on relay_content_publications;
create policy "rcp_insert" on relay_content_publications for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rcp_update" on relay_content_publications;
create policy "rcp_update" on relay_content_publications for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- RELAY CONTENT OUTCOMES
-- Performance metrics per publication.
-- ============================================================================

create table if not exists relay_content_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  publication_id uuid references relay_content_publications(id) on delete cascade,

  -- Engagement metrics
  impressions int,
  unique_reach int,
  likes int,
  comments int,
  shares int,
  saves int,

  -- Conversion metrics
  profile_visits int,
  new_followers int,
  link_clicks int,
  relay_visits int,
  signups int,
  activated_users int,

  -- Metadata
  recorded_at timestamptz not null default now(),
  notes text
);

create index if not exists rco_org_idx on relay_content_outcomes (organization_id);
create index if not exists rco_pub_idx on relay_content_outcomes (publication_id);
alter table relay_content_outcomes enable row level security;

drop policy if exists "rco_select" on relay_content_outcomes;
create policy "rco_select" on relay_content_outcomes for select
  to authenticated using (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rco_insert" on relay_content_outcomes;
create policy "rco_insert" on relay_content_outcomes for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rco_update" on relay_content_outcomes;
create policy "rco_update" on relay_content_outcomes for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- RELAY GROWTH EXPERIMENTS
-- A/B content experiments.
-- ============================================================================

create table if not exists relay_growth_experiments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  hypothesis text not null,
  territory text not null,
  variable text not null,  -- what's being tested

  status text not null default 'planned' check (status in (
    'planned', 'running', 'completed', 'abandoned'
  )),

  started_at timestamptz,
  completed_at timestamptz,

  results jsonb default '{}'::jsonb,
  conclusion text,

  created_at timestamptz not null default now()
);

create index if not exists rgx_org_idx on relay_growth_experiments (organization_id);
create index if not exists rgx_org_status_idx on relay_growth_experiments (organization_id, status);
alter table relay_growth_experiments enable row level security;

drop policy if exists "rgx_select" on relay_growth_experiments;
create policy "rgx_select" on relay_growth_experiments for select
  to authenticated using (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rgx_insert" on relay_growth_experiments;
create policy "rgx_insert" on relay_growth_experiments for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rgx_update" on relay_growth_experiments;
create policy "rgx_update" on relay_growth_experiments for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- SEED DATA: Initial Relay Product Memory
-- Canonical product knowledge that the Growth Engine starts with.
-- ============================================================================

do $$
declare
  org_id uuid;
begin
  select id into org_id from organizations limit 1;
  if org_id is null then return; end if;

  insert into relay_growth_memory (organization_id, memory_type, title, content, source, territories, audience_segments, claim_safety)
  values
    (org_id, 'product_fact', 'Relay Core Thesis', 'AI does the preparation. People make the move.', 'canonical', '{"building_relay", "ai_human_work"}', '{"technical_founder", "bd_lead", "agency_founder"}', 'VERIFIED_PROFILE_PROOF'),
    (org_id, 'product_fact', 'Relay Problem Statement', 'Revenue teams have leads, conversations, content, jobs and signals scattered everywhere, but still don''t know what deserves attention next.', 'canonical', '{"revenue_systems"}', '{"bd_lead", "small_sales_team", "consultancy_owner"}', 'VERIFIED_PROFILE_PROOF'),
    (org_id, 'product_fact', 'Relay Differentiation', 'Relay prioritizes action rather than becoming another CRM dashboard.', 'canonical', '{"revenue_systems", "building_relay"}', '{"technical_founder", "bd_lead"}', 'VERIFIED_PROFILE_PROOF'),
    (org_id, 'product_fact', 'Revenue Identities System', 'Reps work as assigned Revenue Identities. Admin assigns, rep executes. Authorization is server-side.', 'canonical', '{"building_relay", "revenue_systems"}', '{"technical_founder", "bd_lead"}', 'VERIFIED_PROFILE_PROOF'),
    (org_id, 'product_fact', 'Accountability System', 'Daily targets per rep+identity+activity. Progress is server-authoritative.', 'canonical', '{"building_relay", "revenue_systems"}', '{"bd_lead", "small_sales_team"}', 'VERIFIED_PROFILE_PROOF'),
    (org_id, 'product_fact', 'Human-in-the-Loop', 'Relay prepares work, never sends autonomously. Admin approval required for all outbound.', 'canonical', '{"ai_human_work"}', '{"technical_founder", "agency_founder"}', 'VERIFIED_PROFILE_PROOF'),
    (org_id, 'product_fact', 'Multi-tenant Architecture', 'Organizations are isolated. Reps only see their assigned work.', 'canonical', '{"building_relay"}', '{"technical_founder"}', 'VERIFIED_PROFILE_PROOF'),
    (org_id, 'product_fact', 'Content Engine', 'Studio generates content from persona DNA, memory, and taste learning.', 'canonical', '{"building_relay"}', '{"technical_founder", "agency_founder"}', 'VERIFIED_PROFILE_PROOF')
  on conflict do nothing;
end $$;
