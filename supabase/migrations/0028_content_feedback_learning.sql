-- 0028: Learn from accepted/rejected drafts.

do $$ begin
  if to_regclass('public.content_drafts') is not null then
    alter table content_drafts add column if not exists research_finding_id uuid references content_research_findings(id) on delete set null;
    alter table content_drafts add column if not exists source_kind text not null default 'answer' check (source_kind in ('answer', 'conviction', 'field_update'));
  end if;
end $$;

create table if not exists content_draft_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  persona_id uuid not null references content_personas(id) on delete cascade,
  draft_id uuid not null references content_drafts(id) on delete cascade,
  topic_cluster_id uuid references topic_clusters(id) on delete set null,
  source_kind text not null check (source_kind in ('answer', 'conviction', 'field_update')),
  reaction text not null check (reaction in ('posting', 'not_for_me', 'posting_after_edit')),
  edited boolean not null default false,
  edit_signals text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists content_draft_feedback_persona_idx on content_draft_feedback (persona_id, created_at desc);
create index if not exists content_draft_feedback_topic_idx on content_draft_feedback (topic_cluster_id, created_at desc);

alter table content_draft_feedback enable row level security;

drop policy if exists content_draft_feedback_select on content_draft_feedback;
create policy content_draft_feedback_select on content_draft_feedback for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists content_draft_feedback_insert on content_draft_feedback;
create policy content_draft_feedback_insert on content_draft_feedback for insert
  to authenticated with check (organization_id = current_org_id());

drop policy if exists content_draft_feedback_update on content_draft_feedback;
create policy content_draft_feedback_update on content_draft_feedback for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

drop policy if exists content_draft_feedback_delete on content_draft_feedback;
create policy content_draft_feedback_delete on content_draft_feedback for delete
  to authenticated using (organization_id = current_org_id());
