-- 0027: Content engine v4 - agentic topic clusters.
--
-- Replaces user-managed pillars with self-organizing topic clusters. Research
-- findings become source-linked records tied to clusters. Draft/history keep a
-- topic_cluster_id for repetition and relevance checks.

create table if not exists topic_clusters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  persona_id uuid not null references content_personas(id) on delete cascade,
  cluster_name text not null,
  description text not null default '',
  source_type text not null default 'system' check (source_type in ('profile', 'answer', 'research', 'system')),
  merged_into_id uuid references topic_clusters(id) on delete set null,
  last_input_at timestamptz,
  last_research_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists topic_clusters_org_idx on topic_clusters (organization_id);
create index if not exists topic_clusters_persona_idx on topic_clusters (persona_id);
create index if not exists topic_clusters_persona_recent_idx on topic_clusters (persona_id, updated_at desc);

alter table topic_clusters enable row level security;

drop policy if exists topic_clusters_select on topic_clusters;
create policy topic_clusters_select on topic_clusters for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists topic_clusters_insert on topic_clusters;
create policy topic_clusters_insert on topic_clusters for insert
  to authenticated with check (organization_id = current_org_id());

drop policy if exists topic_clusters_update on topic_clusters;
create policy topic_clusters_update on topic_clusters for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

drop policy if exists topic_clusters_delete on topic_clusters;
create policy topic_clusters_delete on topic_clusters for delete
  to authenticated using (organization_id = current_org_id());

create table if not exists content_research_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  persona_id uuid not null references content_personas(id) on delete cascade,
  topic_cluster_id uuid not null references topic_clusters(id) on delete cascade,
  finding text not null,
  source_label text not null,
  source_url text not null,
  source_published_at timestamptz,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists content_research_findings_org_idx on content_research_findings (organization_id);
create index if not exists content_research_findings_persona_idx on content_research_findings (persona_id, created_at desc);
create index if not exists content_research_findings_unused_idx on content_research_findings (persona_id, used, created_at desc);

alter table content_research_findings enable row level security;

drop policy if exists content_research_findings_select on content_research_findings;
create policy content_research_findings_select on content_research_findings for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists content_research_findings_insert on content_research_findings;
create policy content_research_findings_insert on content_research_findings for insert
  to authenticated with check (organization_id = current_org_id());

drop policy if exists content_research_findings_update on content_research_findings;
create policy content_research_findings_update on content_research_findings for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

drop policy if exists content_research_findings_delete on content_research_findings;
create policy content_research_findings_delete on content_research_findings for delete
  to authenticated using (organization_id = current_org_id());

do $$ begin
  if to_regclass('public.content_drafts') is not null then
    alter table content_drafts add column if not exists topic_cluster_id uuid references topic_clusters(id) on delete set null;
    alter table content_drafts add column if not exists specificity_hit boolean not null default false;
    create index if not exists content_drafts_topic_cluster_idx on content_drafts (topic_cluster_id);
  end if;
end $$;

do $$ begin
  if to_regclass('public.content_history') is not null then
    alter table content_history add column if not exists topic_cluster_id uuid references topic_clusters(id) on delete set null;
    create index if not exists content_history_topic_cluster_idx on content_history (topic_cluster_id);
  end if;
end $$;

do $$ begin
  if to_regclass('public.trending_angles') is not null then
    alter table trending_angles add column if not exists topic_cluster_id uuid references topic_clusters(id) on delete set null;
    alter table trending_angles add column if not exists source_url text not null default '';
  end if;
end $$;

create table if not exists content_engagement_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  persona_id uuid not null references content_personas(id) on delete cascade,
  draft_id uuid references content_drafts(id) on delete set null,
  comment_text text not null,
  is_question boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists content_engagement_events_persona_idx on content_engagement_events (persona_id, created_at desc);

alter table content_engagement_events enable row level security;

drop policy if exists content_engagement_events_select on content_engagement_events;
create policy content_engagement_events_select on content_engagement_events for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists content_engagement_events_insert on content_engagement_events;
create policy content_engagement_events_insert on content_engagement_events for insert
  to authenticated with check (organization_id = current_org_id());

drop policy if exists content_engagement_events_update on content_engagement_events;
create policy content_engagement_events_update on content_engagement_events for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

drop policy if exists content_engagement_events_delete on content_engagement_events;
create policy content_engagement_events_delete on content_engagement_events for delete
  to authenticated using (organization_id = current_org_id());
