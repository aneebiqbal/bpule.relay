-- 0035: Content Memory, Opportunities, Idea Genomes, Evaluations, Interviews.
--
-- These tables support the Content Intelligence System:
-- content_memories: tracks what has been covered (topics, angles, hooks, stories)
-- content_opportunities: discovered potential posts from the Post Radar
-- content_idea_genomes: structured representation of content ideas before drafting
-- content_evaluations: per-draft quality and distribution scoring
-- content_interview_sessions / content_interview_answers: adaptive interview state

-- ── Content Memory ──────────────────────────────────────────────────────────
create table if not exists content_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  persona_id uuid not null references content_personas(id) on delete cascade,

  memory_type text not null check (memory_type in (
    'topic_covered', 'angle_used', 'hook_used', 'story_used',
    'claim_made', 'opinion_expressed', 'example_used', 'archetype_used'
  )),
  content text not null,
  source_draft_id uuid references content_drafts(id) on delete set null,
  source_history_id uuid references content_history(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists content_memories_persona_idx on content_memories (persona_id, created_at desc);
create index if not exists content_memories_type_idx on content_memories (persona_id, memory_type, created_at desc);

alter table content_memories enable row level security;

drop policy if exists "content_memories_owner" on content_memories;
create policy "content_memories_owner" on content_memories
  for all using (organization_id = current_org_id());

-- ── Content Opportunities ───────────────────────────────────────────────────
create table if not exists content_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  persona_id uuid not null references content_personas(id) on delete cascade,

  opportunity_type text not null check (opportunity_type in (
    'recent_work', 'production_lesson', 'mistake_or_failure',
    'technical_decision', 'changed_opinion', 'useful_explanation',
    'industry_development', 'contrarian_position', 'behind_the_build',
    'customer_lesson', 'career_lesson', 'experiment', 'unexpected_result',
    'timely_discussion'
  )),

  title text not null,
  description text not null,
  trigger text not null,

  -- Qualification scores (filled by Opportunity Qualification)
  qualification jsonb not null default '{}',
  qualified boolean not null default false,

  -- Source material
  source_kind text check (source_kind in ('user_input', 'interview', 'research', 'system_inferred', 'history_pattern')),
  source_reference text,

  -- Lifecycle
  status text not null default 'pending' check (status in (
    'pending', 'exploring', 'interviewing', 'qualifying', 'in_forge', 'completed', 'dismissed'
  )),

  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  completed_at timestamptz
);

create index if not exists content_opportunities_persona_idx on content_opportunities (persona_id, created_at desc);
create index if not exists content_opportunities_status_idx on content_opportunities (persona_id, status, created_at desc);

alter table content_opportunities enable row level security;

drop policy if exists "content_opportunities_owner" on content_opportunities;
create policy "content_opportunities_owner" on content_opportunities
  for all using (organization_id = current_org_id());

-- ── Idea Genomes ─────────────────────────────────────────────────────────────
create table if not exists content_idea_genomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  persona_id uuid not null references content_personas(id) on delete cascade,

  -- Core structure
  source text not null check (source in (
    'personal_experience', 'professional_expertise', 'opinion',
    'industry_observation', 'contrarian_take', 'lesson_learned',
    'behind_the_build', 'customer_insight', 'experiment_result'
  )),
  topic text not null,
  angle text not null,
  archetype text not null check (archetype in (
    'story_to_lesson', 'lesson_direct', 'contrarian_stand',
    'how_to', 'behind_the_scenes', 'hot_take', 'data_driven',
    'question_engagement', 'mistake_to_wins', 'career_lesson'
  )),
  audience text not null,
  emotion text,
  value_type text check (value_type in ('practical', 'emotional', 'intellectual', 'social')),

  -- Scores
  novelty double precision not null default 0 check (novelty between 0 and 1),
  evidence_strength double precision not null default 0 check (evidence_strength between 0 and 1),
  personal_specificity double precision not null default 0 check (personal_specificity between 0 and 1),
  relevance double precision not null default 0 check (relevance between 0 and 1),
  conversation_potential double precision not null default 0 check (conversation_potential between 0 and 1),

  -- Differentiation
  content_memory_overlap jsonb not null default '[]',
  differentiation_note text not null default '',

  -- Lifecycle
  status text not null default 'candidate' check (status in (
    'candidate', 'qualified', 'rejected', 'in_forge', 'published', 'archived'
  )),
  rejection_reason text,

  -- Links
  opportunity_id uuid references content_opportunities(id) on delete set null,
  draft_id uuid references content_drafts(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_idea_genomes_persona_idx on content_idea_genomes (persona_id, created_at desc);
create index if not exists content_idea_genomes_status_idx on content_idea_genomes (persona_id, status, created_at desc);

alter table content_idea_genomes enable row level security;

drop policy if exists "content_idea_genomes_owner" on content_idea_genomes;
create policy "content_idea_genomes_owner" on content_idea_genomes
  for all using (organization_id = current_org_id());

-- ── Content Evaluations ──────────────────────────────────────────────────────
create table if not exists content_evaluations (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references content_drafts(id) on delete cascade,

  -- Quality dimensions
  originality double precision not null default 0 check (originality between 0 and 1),
  personal_specificity double precision not null default 0 check (personal_specificity between 0 and 1),
  usefulness double precision not null default 0 check (usefulness between 0 and 1),
  credibility double precision not null default 0 check (credibility between 0 and 1),
  evidence double precision not null default 0 check (evidence between 0 and 1),
  clarity double precision not null default 0 check (clarity between 0 and 1),
  storytelling double precision not null default 0 check (storytelling between 0 and 1),
  voice_match double precision not null default 0 check (voice_match between 0 and 1),

  -- Distribution dimensions
  stop_potential double precision not null default 0 check (stop_potential between 0 and 1),
  dwell_potential double precision not null default 0 check (dwell_potential between 0 and 1),
  comment_potential double precision not null default 0 check (comment_potential between 0 and 1),
  save_potential double precision not null default 0 check (save_potential between 0 and 1),
  share_potential double precision not null default 0 check (share_potential between 0 and 1),
  audience_relevance double precision not null default 0 check (audience_relevance between 0 and 1),

  -- Anti-slop
  slop_score double precision not null default 0 check (slop_score between 0 and 1),
  generic_probability double precision not null default 0,

  -- Explainability
  quality_notes jsonb not null default '{}',
  distribution_notes jsonb not null default '{}',

  created_at timestamptz not null default now()
);

create index if not exists content_evaluations_draft_idx on content_evaluations (draft_id);

alter table content_evaluations enable row level security;

drop policy if exists "content_evaluations_owner" on content_evaluations;
create policy "content_evaluations_owner" on content_evaluations
  for all using (draft_id in (select id from content_drafts where persona_id in (select id from content_personas where organization_id = current_org_id())));

-- ── Interview Sessions ───────────────────────────────────────────────────────
create table if not exists content_interview_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  persona_id uuid not null references content_personas(id) on delete cascade,
  opportunity_id uuid references content_opportunities(id) on delete set null,

  session_type text not null check (session_type in ('onboarding', 'opportunity_exploration', 'post_qualification')),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),

  questions_asked integer not null default 0,
  information_gain double precision not null default 0,

  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists content_interview_sessions_persona_idx on content_interview_sessions (persona_id, created_at desc);

alter table content_interview_sessions enable row level security;

drop policy if exists "content_interview_sessions_owner" on content_interview_sessions;
create policy "content_interview_sessions_owner" on content_interview_sessions
  for all using (organization_id = current_org_id());

create table if not exists content_interview_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references content_interview_sessions(id) on delete cascade,
  question text not null,
  answer text not null,
  information_gain double precision not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists content_interview_answers_session_idx on content_interview_answers (session_id, created_at desc);

alter table content_interview_answers enable row level security;

drop policy if exists "content_interview_answers_owner" on content_interview_answers;
create policy "content_interview_answers_owner" on content_interview_answers
  for all using (session_id in (select id from content_interview_sessions where organization_id = current_org_id()));

-- ── Extend content_drafts with genome + evaluation ────────────────────────────
do $$ begin
  if to_regclass('public.content_drafts') is not null then
    alter table content_drafts add column if not exists candidate_rank integer;
    alter table content_drafts add column if not exists generation_cost_usd double precision;
  end if;
end $$;
