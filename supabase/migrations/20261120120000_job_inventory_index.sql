-- Non-destructive job inventory reindex.
-- Jobs are never deleted or mutated by the reindex; the index decides what the
-- active feed shows and what is retained for review/history.
create table if not exists job_inventory_index (
  job_id uuid primary key references jobs(id) on delete cascade,
  source_id text,
  employer text,
  category text,
  profile_relevance text,
  skills text[] not null default '{}',
  employment_type text,
  location_restriction text,
  pakistan_eligibility text,
  published_at timestamptz,
  published_age_days integer,
  last_seen_at timestamptz,
  last_verified_at timestamptz,
  verification_status text,
  closed_at timestamptz,
  duplicate_group_id uuid,
  apply_url_quality text,
  feed_bucket text,
  include_in_feed boolean not null default false,
  reason text,
  computed_at timestamptz not null default now()
);
create index if not exists job_inventory_feed_idx on job_inventory_index (include_in_feed, feed_bucket);
create index if not exists job_inventory_bucket_idx on job_inventory_index (feed_bucket);

alter table job_inventory_index enable row level security;
drop policy if exists job_inventory_index_select on job_inventory_index;
create policy job_inventory_index_select on job_inventory_index for select to authenticated, service_role
  using (true);
