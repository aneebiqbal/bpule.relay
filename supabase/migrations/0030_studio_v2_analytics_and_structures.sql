-- 0030: Studio v2 — real analytics fields, and a curated post-structure library
-- used only as generation scaffolding, never as an outcome promise.

do $$ begin
  if to_regclass('public.content_history') is not null then
    alter table content_history add column if not exists likes integer;
    alter table content_history add column if not exists reach integer;
    alter table content_history add column if not exists comments integer;
    alter table content_history add column if not exists reposts integer;
    alter table content_history add column if not exists saves integer;
    alter table content_history add column if not exists profile_visits integer;
    alter table content_history add column if not exists follower_delta integer;
    alter table content_history add column if not exists metrics_logged_at timestamptz;
  end if;
end $$;

create table if not exists content_post_structures (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('contrarian_opener', 'story_opener', 'question_opener', 'data_point_opener')),
  structure_name text not null,
  shape text not null,
  example text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists content_post_structures_category_idx on content_post_structures (category);

alter table content_post_structures enable row level security;

drop policy if exists content_post_structures_select on content_post_structures;
create policy content_post_structures_select on content_post_structures for select
  to authenticated using (true);

do $$ begin
  if to_regclass('public.content_drafts') is not null then
    alter table content_drafts add column if not exists structure_id uuid references content_post_structures(id) on delete set null;
  end if;
end $$;
