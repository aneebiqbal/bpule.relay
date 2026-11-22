-- Explicit freshness timestamps for the proactive feed.
alter table jobs add column if not exists content_changed_at timestamptz;
alter table jobs add column if not exists source_updated_at timestamptz;
create index if not exists jobs_content_changed_idx on jobs (content_changed_at desc);
