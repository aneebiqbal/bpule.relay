-- Studio V2 + Relay Growth V2: Trend Intelligence + Daily Editorial Engine

-- 1. TREND SOURCES — adapter registry + health status
create table if not exists trend_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_type text not null check (source_type in ('hackernews', 'devto', 'github', 'stackoverflow', 'rss', 'arxiv')),
  display_name text not null,
  base_url text,
  enabled boolean not null default true,
  fetch_interval_minutes integer not null default 60,
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,
  rate_limit_remaining integer,
  rate_limit_reset_at timestamptz,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table trend_sources enable row level security;

create policy "trend_sources_read" on trend_sources
  for select using (true);

create policy "trend_sources_write" on trend_sources
  for all using (false) with check (false);

comment on table trend_sources is 'Registry of trend source adapters with health tracking';
comment on column trend_sources.source_key is 'Unique identifier e.g. hackernews-top, devto-popular, github-trending';
comment on column trend_sources.consecutive_failures is 'Circuit breaker counter — source disabled after 5';

-- 2. TREND ITEMS — normalized, deduplicated global signals
create table if not exists trend_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references trend_sources(id) on delete cascade,
  source_item_id text not null,
  url text,
  title text not null,
  excerpt text,
  author text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  metrics jsonb not null default '{}',
  topics text[] not null default '{}',
  content_fingerprint text not null,
  evidence_quality text not null default 'medium' check (evidence_quality in ('high', 'medium', 'low')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

alter table trend_items enable row level security;

create unique index if not exists trend_items_fingerprint_idx
  on trend_items (content_fingerprint);

create index if not exists trend_items_source_idx
  on trend_items (source_id, fetched_at desc);

create index if not exists trend_items_topics_idx
  on trend_items using gin (topics);

create index if not exists trend_items_published_idx
  on trend_items (published_at desc);

create index if not exists trend_items_expires_idx
  on trend_items (expires_at);

create policy "trend_items_read" on trend_items
  for select using (true);

create policy "trend_items_write" on trend_items
  for all using (false) with check (false);

comment on table trend_items is 'Normalized, deduplicated trend signals from all sources';
comment on column trend_items.content_fingerprint is 'Canonical URL + normalized title hash for dedup';
comment on column trend_items.evidence_quality is 'high=first-party, medium=secondary, low=tertiary';
comment on column trend_items.metrics is 'Source-specific engagement data (stars, points, comments)';

-- 3. DAILY CONTENT BRIEFS — persona+date scoped, persisted
create table if not exists daily_content_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  persona_id uuid not null references content_personas(id) on delete cascade,
  local_date date not null,
  generation_version integer not null default 1,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed', 'stale')),
  recommended_idea_id uuid,
  trend_snapshot jsonb not null default '{}',
  prompt_version text not null default 'v1',
  runtime_version text not null default '1.0',
  generation_started_at timestamptz,
  generation_completed_at timestamptz,
  generation_cost_usd numeric(10,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table daily_content_briefs enable row level security;

create unique index if not exists daily_brief_persona_date_ver_idx
  on daily_content_briefs (persona_id, local_date, generation_version);

create index if not exists daily_brief_org_date_idx
  on daily_content_briefs (organization_id, local_date desc);

create index if not exists daily_brief_status_idx
  on daily_content_briefs (status, created_at);

create policy "daily_briefs_org_read" on daily_content_briefs
  for select using (organization_id = current_org_id());

create policy "daily_briefs_org_insert" on daily_content_briefs
  for insert with check (organization_id = current_org_id());

create policy "daily_briefs_org_update" on daily_content_briefs
  for update using (organization_id = current_org_id());

create policy "daily_briefs_org_delete" on daily_content_briefs
  for delete using (organization_id = current_org_id() and is_org_admin());

comment on table daily_content_briefs is 'One brief per persona per local date — persistent daily editorial state';
comment on column daily_content_briefs.trend_snapshot is 'JSON array of trend IDs used for this brief';
comment on column daily_content_briefs.recommended_idea_id is 'Points to the recommended idea in daily_content_ideas';

-- 4. DAILY CONTENT IDEAS — 5 ideas per brief
create table if not exists daily_content_ideas (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references daily_content_briefs(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  persona_id uuid not null references content_personas(id) on delete cascade,
  idea_type text not null check (idea_type in ('recommended', 'alternate')),
  title text not null,
  angle text,
  why_now text,
  source_ids uuid[] not null default '{}',
  source_freshness text check (source_freshness in ('new_today', 'recent', 'active_discussion', 'growing_attention', 'fresh_announcement', 'evergreen')),
  format_suggestion text,
  territory text,
  novelty_score numeric(3,2) check (novelty_score >= 0 and novelty_score <= 1),
  relevance_score numeric(3,2) check (relevance_score >= 0 and relevance_score <= 1),
  credibility_score numeric(3,2) check (credibility_score >= 0 and credibility_score <= 1),
  insight_score numeric(3,2) check (insight_score >= 0 and insight_score <= 1),
  trend_grounded boolean not null default false,
  -- For recommended idea: finished post
  post_caption text,
  post_platform text default 'linkedin',
  -- Visual direction (structured)
  visual_type text check (visual_type in ('PRODUCT_SCREENSHOT', 'EDITORIAL_GRAPHIC', 'TECHNICAL_DIAGRAM', 'TYPOGRAPHIC_CONCEPT', 'DATA_VISUAL', 'GENERATED_IMAGE', 'NO_VISUAL')),
  visual_concept text,
  visual_prompt text,
  visual_composition text,
  visual_aspect_ratio text default '1.91:1',
  visual_focal_point text,
  visual_allowed_text text,
  visual_screenshot_target text,
  visual_reason text,
  -- Quality gate result
  quality_result jsonb,
  -- User interaction
  copied_at timestamptz,
  posted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now()
);

alter table daily_content_ideas enable row level security;

create index if not exists daily_ideas_brief_idx
  on daily_content_ideas (brief_id);

create index if not exists daily_ideas_persona_idx
  on daily_content_ideas (persona_id, created_at desc);

create index if not exists daily_ideas_org_idx
  on daily_content_ideas (organization_id);

create policy "daily_ideas_org_read" on daily_content_ideas
  for select using (organization_id = current_org_id());

create policy "daily_ideas_org_insert" on daily_content_ideas
  for insert with check (organization_id = current_org_id());

create policy "daily_ideas_org_update" on daily_content_ideas
  for update using (organization_id = current_org_id());

create policy "daily_ideas_org_delete" on daily_content_ideas
  for delete using (organization_id = current_org_id() and is_org_admin());

comment on table daily_content_ideas is '5 ideas per daily brief — 1 recommended + 4 alternates';
comment on column daily_content_ideas.source_freshness is 'Honest label — never "trending" without evidence';
comment on column daily_content_ideas.visual_type is 'Structured visual strategy per post';

-- 5. EXTEND content_personas — add trend interest profile
alter table content_personas
  add column if not exists trend_interest_profile jsonb,
  add column if not exists last_brief_at timestamptz;

comment on column content_personas.trend_interest_profile is 'Primary/secondary territories, technologies, excluded topics for trend matching';
comment on column content_personas.last_brief_at is 'Last successful daily brief generation timestamp';

-- 6. EXTEND content_profiles — add field confidence metadata
alter table content_profiles
  add column if not exists field_confidence jsonb,
  add column if not exists persona_version integer not null default 1;

comment on column content_profiles.field_confidence is 'Per-field confidence: PROVIDED, STRONG_INFERENCE, WEAK_INFERENCE, UNKNOWN';
comment on column content_profiles.persona_version is 'Incremented on each persona synthesis';

-- 7. DAILY GROWTH BRIEFS — system-owned, no persona needed
create table if not exists daily_growth_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  local_date date not null,
  generation_version integer not null default 1,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed', 'stale')),
  recommended_idea_id uuid,
  trend_snapshot jsonb not null default '{}',
  prompt_version text not null default 'v1',
  post_caption text,
  visual_type text check (visual_type in ('PRODUCT_SCREENSHOT', 'EDITORIAL_GRAPHIC', 'TECHNICAL_DIAGRAM', 'TYPOGRAPHIC_CONCEPT', 'DATA_VISUAL', 'GENERATED_IMAGE', 'NO_VISUAL')),
  visual_concept text,
  visual_prompt text,
  visual_reason text,
  alternate_ideas jsonb not null default '[]',
  content_memory_hash text,
  quality_result jsonb,
  generation_cost_usd numeric(10,6),
  copied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table daily_growth_briefs enable row level security;

create unique index if not exists daily_growth_brief_date_ver_idx
  on daily_growth_briefs (organization_id, local_date, generation_version);

create index if not exists daily_growth_brief_status_idx
  on daily_growth_briefs (status, created_at);

create policy "daily_growth_briefs_org_read" on daily_growth_briefs
  for select using (organization_id = current_org_id() and is_org_admin());

create policy "daily_growth_briefs_org_insert" on daily_growth_briefs
  for insert with check (organization_id = current_org_id() and is_org_admin());

create policy "daily_growth_briefs_org_update" on daily_growth_briefs
  for update using (organization_id = current_org_id() and is_org_admin());

comment on table daily_growth_briefs is 'System-owned daily brief for Relay Growth — admin access only';
comment on column daily_growth_briefs.alternate_ideas is '2-4 compact alternate ideas as JSON array';

-- Seed default trend sources
insert into trend_sources (source_key, source_type, display_name, base_url, fetch_interval_minutes)
values
  ('hackernews-top', 'hackernews', 'Hacker News Top', 'https://hacker-news.firebaseio.com/v0', 60),
  ('hackernews-best', 'hackernews', 'Hacker News Best', 'https://hacker-news.firebaseio.com/v0', 120),
  ('hackernews-new', 'hackernews', 'Hacker News New', 'https://hacker-news.firebaseio.com/v0', 60),
  ('devto-popular', 'devto', 'DEV Community Popular', 'https://dev.to/api', 180),
  ('devto-latest', 'devto', 'DEV Community Latest', 'https://dev.to/api', 120),
  ('github-trending', 'github', 'GitHub Trending', 'https://api.github.com', 240),
  ('stackoverflow-recent', 'stackoverflow', 'Stack Overflow', 'https://api.stackexchange.com/2.3', 360)
on conflict (source_key) do nothing;
