-- Phase 8 schema: Upwork jobs, CSV imports, push subscriptions, connects tracking, archive search.

-- ============================================================================
-- Upwork jobs: separate from leads, scored on their own rubric.
-- ============================================================================

create table if not exists upwork_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_rep_id uuid references reps(id),
  title text not null,
  description text not null,
  budget_min int,
  budget_max int,
  hourly_rate_min int,
  hourly_rate_max int,
  proposal_count int,
  connects_cost int default 0,
  required_skills text[] default '{}',
  urgency_signal text, -- e.g. "previous developer left", "inherited codebase"
  score int check (score between 0 and 10),
  verdict text check (verdict in ('apply', 'apply_if_connects', 'skip')),
  status text default 'new' check (status in ('new', 'drafted', 'applied', 'replied', 'no', 'dead')),
  extracted_fields jsonb,
  raw_input text,
  tags text[] default '{}',
  created_at timestamptz default now()
);

create index if not exists upwork_jobs_owner_idx on upwork_jobs (owner_rep_id);
create index if not exists upwork_jobs_status_idx on upwork_jobs (status);

-- RLS: owner or admin.
alter table upwork_jobs enable row level security;

drop policy if exists upwork_jobs_select on upwork_jobs;
create policy upwork_jobs_select on upwork_jobs for select
  to authenticated using (owner_rep_id = public.current_rep_id() or public.is_admin());
drop policy if exists upwork_jobs_insert on upwork_jobs;
create policy upwork_jobs_insert on upwork_jobs for insert
  to authenticated with check (owner_rep_id = public.current_rep_id());
drop policy if exists upwork_jobs_update on upwork_jobs;
create policy upwork_jobs_update on upwork_jobs for update
  to authenticated using (owner_rep_id = public.current_rep_id() or public.is_admin())
  with check (owner_rep_id = public.current_rep_id() or public.is_admin());
drop policy if exists upwork_jobs_delete on upwork_jobs;
create policy upwork_jobs_delete on upwork_jobs for delete
  to authenticated using (public.is_admin());

-- ============================================================================
-- Upwork messages: cover letters and follow-ups tied to a job.
-- ============================================================================

create table if not exists upwork_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references upwork_jobs(id) not null,
  rep_id uuid references reps(id),
  type text not null check (type in ('cover', 'followup', 'reply')),
  draft_text text,
  sent_text text,
  sent_at timestamptz,
  model_used text,
  created_at timestamptz default now()
);

create index if not exists upwork_messages_job_idx on upwork_messages (job_id);

alter table upwork_messages enable row level security;

drop policy if exists upwork_messages_select on upwork_messages;
create policy upwork_messages_select on upwork_messages for select
  to authenticated using (
    exists (select 1 from upwork_jobs j where j.id = job_id and (j.owner_rep_id = public.current_rep_id() or public.is_admin()))
  );
drop policy if exists upwork_messages_insert on upwork_messages;
create policy upwork_messages_insert on upwork_messages for insert
  to authenticated with check (
    exists (select 1 from upwork_jobs j where j.id = job_id and (j.owner_rep_id = public.current_rep_id() or public.is_admin()))
  );

-- ============================================================================
-- Push subscriptions: one per rep, for reply + follow-up-eligible notifications.
-- ============================================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid references reps(id) unique not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

alter table push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on push_subscriptions;
create policy push_subscriptions_own on push_subscriptions for all
  to authenticated using (rep_id = public.current_rep_id())
  with check (rep_id = public.current_rep_id());

-- ============================================================================
-- Full-text search support on leads and proof_items.
-- ============================================================================

-- Add a generated search vector column to leads for tsvector search.
alter table leads add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(company, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(contact_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(contact_title, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(signal_evidence, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(verbatim_quote, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(raw_input, '')), 'D')
  ) stored;

create index if not exists leads_search_idx on leads using gin (search_vector);

-- Add a generated search vector column to proof_items.
alter table proof_items add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(project_summary, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(review_quote, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(client_name, '')), 'B')
  ) stored;

create index if not exists proof_items_search_idx on proof_items using gin (search_vector);

-- Add a generated search vector column to upwork_jobs.
alter table upwork_jobs add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(urgency_signal, '')), 'C')
  ) stored;

create index if not exists upwork_jobs_search_idx on upwork_jobs using gin (search_vector);

-- ============================================================================
-- Function: archive search across leads, proof_items, and upwork_jobs.
-- ============================================================================

create or replace function public.archive_search(
  query text,
  entity_filter text default 'all', -- 'lead', 'proof', 'upwork', 'all'
  status_filter text[] default '{}',
  signal_filter int[] default '{}',
  play_filter uuid[] default '{}',
  rep_filter uuid[] default '{}',
  date_from timestamptz default null,
  date_to timestamptz default null,
  result_limit int default 20
)
returns table (
  entity_type text,
  id uuid,
  title text,
  subtitle text,
  status text,
  created_at timestamptz,
  rank float
)
language sql
stable
security definer
set search_path = public
as $$
  with lead_results as (
    select
      'lead'::text as entity_type,
      l.id,
      l.company as title,
      coalesce(l.contact_name, '') as subtitle,
      l.status,
      l.created_at,
      ts_rank(l.search_vector, plainto_tsquery('english', query)) as rank
    from leads l
    where (entity_filter = 'all' or entity_filter = 'lead')
      and l.search_vector @@ plainto_tsquery('english', query)
      and (cardinality(status_filter) = 0 or l.status = any(status_filter))
      and (cardinality(signal_filter) = 0 or l.signal_type = any(signal_filter))
      and (cardinality(play_filter) = 0 or l.play_id = any(play_filter))
      and (cardinality(rep_filter) = 0 or l.owner_rep_id = any(rep_filter))
      and (date_from is null or l.created_at >= date_from)
      and (date_to is null or l.created_at <= date_to)
  ),
  proof_results as (
    select
      'proof'::text as entity_type,
      p.id,
      p.project_summary as title,
      coalesce(p.client_name, '') as subtitle,
      null::text as status,
      p.created_at,
      ts_rank(p.search_vector, plainto_tsquery('english', query)) as rank
    from proof_items p
    where (entity_filter = 'all' or entity_filter = 'proof')
      and p.search_vector @@ plainto_tsquery('english', query)
      and (date_from is null or p.created_at >= date_from)
      and (date_to is null or p.created_at <= date_to)
  ),
  upwork_results as (
    select
      'upwork'::text as entity_type,
      j.id,
      j.title,
      left(j.description, 80) as subtitle,
      j.status,
      j.created_at,
      ts_rank(j.search_vector, plainto_tsquery('english', query)) as rank
    from upwork_jobs j
    where (entity_filter = 'all' or entity_filter = 'upwork')
      and j.search_vector @@ plainto_tsquery('english', query)
      and (cardinality(status_filter) = 0 or j.status = any(status_filter))
      and (cardinality(rep_filter) = 0 or j.owner_rep_id = any(rep_filter))
      and (date_from is null or j.created_at >= date_from)
      and (date_to is null or j.created_at <= date_to)
  )
  select * from lead_results
  union all
  select * from proof_results
  union all
  select * from upwork_results
  order by rank desc
  limit result_limit;
$$;

-- ============================================================================
-- Function: notify on reply and follow-up eligibility.
-- Called by triggers on outcomes and messages tables.
-- ============================================================================

create or replace function public.notify_on_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sub record;
begin
  for sub in
    select s.endpoint, s.p256dh, s.auth
    from push_subscriptions s
    where s.rep_id = (
      select owner_rep_id from leads where id = new.lead_id
    )
  loop
    -- In a real system this would call a web-push library.
    -- For now we store a notification log that the polling endpoint reads.
    insert into notification_log (rep_id, type, payload)
    values (
      (select owner_rep_id from leads where id = new.lead_id),
      'reply',
      jsonb_build_object('lead_id', new.lead_id, 'stage', new.stage, 'occurred_at', new.occurred_at)
    );
  end loop;
  return new;
end;
$$;

-- ============================================================================
-- Notification log: polled by the client when push is not available.
-- ============================================================================

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid references reps(id) not null,
  type text not null check (type in ('reply', 'followup_eligible')),
  payload jsonb not null,
  read boolean default false,
  created_at timestamptz default now()
);

create index if not exists notification_log_rep_idx on notification_log (rep_id, read);

alter table notification_log enable row level security;

drop policy if exists notification_log_own on notification_log;
create policy notification_log_own on notification_log for all
  to authenticated using (rep_id = public.current_rep_id())
  with check (rep_id = public.current_rep_id());

-- Trigger: when an outcome stage = 'replied' is inserted, notify.
create or replace trigger notify_reply
after insert on outcomes
for each row
when (new.stage = 'replied')
execute function public.notify_on_reply();

-- ============================================================================
-- Function: mark follow-up eligible and notify.
-- Called when a lead status changes to 'contacted' (a message was sent).
-- ============================================================================

create or replace function public.check_followup_eligible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A lead becomes follow-up eligible 3 days after being contacted
  -- with no reply. We log a notification row that can be polled.
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
    and new.sent_at < now() - interval '3 days';
  return new;
end;
$$;

-- ============================================================================
-- CSV import log: audit trail for bulk uploads.
-- ============================================================================

create table if not exists csv_imports (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid references reps(id) not null,
  file_name text,
  total_rows int not null default 0,
  imported int not null default 0,
  duplicates int not null default 0,
  invalid int not null default 0,
  details jsonb,
  created_at timestamptz default now()
);

alter table csv_imports enable row level security;

drop policy if exists csv_imports_own on csv_imports;
create policy csv_imports_own on csv_imports for select
  to authenticated using (rep_id = public.current_rep_id() or public.is_admin());
drop policy if exists csv_imports_insert on csv_imports;
create policy csv_imports_insert on csv_imports for insert
  to authenticated with check (rep_id = public.current_rep_id());
