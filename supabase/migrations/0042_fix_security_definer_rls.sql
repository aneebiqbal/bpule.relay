-- 0042: Fix SECURITY DEFINER RPC tenant isolation vulnerabilities
--
-- Fixes three cross-organization data leaks in SECURITY DEFINER functions:
-- 1. archive_search — no org filter, returned all orgs' leads/proofs/jobs
-- 2. match_proofs_by_embedding — no org filter, returned all orgs' proofs
-- 3. refresh_few_shot_wins — no org filter, wrote wins with wrong org_id
--
-- Also fixes notification triggers that don't set organization_id on inserts.
--
-- SECURITY DEFINER functions run as the function owner, bypassing RLS on the
-- tables they query. Every such function MUST filter by current_org_id() or an
-- explicitly passed org parameter resolved from the authenticated session.

-- ============================================================================
-- 1. archive_search: add organization_id filter to all three subqueries
-- ============================================================================

create or replace function public.archive_search(
  query text,
  entity_filter text default 'all',
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
      and l.organization_id = current_org_id()
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
      and p.organization_id = current_org_id()
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
      and j.organization_id = current_org_id()
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
-- 2. match_proofs_by_embedding: add organization_id filter
-- ============================================================================

create or replace function public.match_proofs_by_embedding(
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  profile_id uuid,
  project_summary text,
  review_quote text,
  tags text[],
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.profile_id,
    p.project_summary,
    p.review_quote,
    p.tags,
    1 - (p.embedding <=> query_embedding) as similarity
  from proof_items p
  where p.embedding is not null
    and p.organization_id = current_org_id()
    and 1 - (p.embedding <=> query_embedding) > match_threshold
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================================
-- 3. refresh_few_shot_wins: add org parameter, filter, and correct org_id on write
-- ============================================================================

create or replace function public.refresh_few_shot_wins(p_org_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
  target_org_id uuid;
begin
  target_org_id := coalesce(p_org_id, current_org_id());

  if target_org_id is null then
    raise exception 'refresh_few_shot_wins: no organization context available';
  end if;

  insert into few_shot_wins (organization_id, message_id, lead_id, play_id, signal_type, sent_text, company, signal_evidence, tags)
  select
    target_org_id,
    m.id,
    m.lead_id,
    l.play_id,
    l.signal_type,
    m.sent_text,
    l.company,
    l.signal_evidence,
    l.tags
  from messages m
  join leads l on l.id = m.lead_id
  where m.sent_text is not null
    and l.organization_id = target_org_id
    and exists (
      select 1 from outcomes o
      where o.lead_id = m.lead_id and o.stage = 'replied'
    )
    and not exists (
      select 1 from few_shot_wins f where f.message_id = m.id
    )
  on conflict (message_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- ============================================================================
-- 4. notify_on_reply: set correct organization_id on notification_log insert
-- ============================================================================

create or replace function public.notify_on_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_owner_rep_id uuid;
begin
  select l.organization_id, l.owner_rep_id
  into v_org_id, v_owner_rep_id
  from leads l
  where l.id = new.lead_id;

  if v_owner_rep_id is null then
    return new;
  end if;

  insert into notification_log (rep_id, type, payload, organization_id)
  values (
    v_owner_rep_id,
    'reply',
    jsonb_build_object('lead_id', new.lead_id, 'stage', new.stage, 'occurred_at', new.occurred_at),
    v_org_id
  );

  return new;
end;
$$;

-- ============================================================================
-- 5. check_followup_eligible: set correct organization_id on notification_log insert
-- ============================================================================

create or replace function public.check_followup_eligible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notification_log (rep_id, type, payload, organization_id)
  select
    l.owner_rep_id,
    'followup_eligible',
    jsonb_build_object('lead_id', new.lead_id, 'sent_at', new.sent_at),
    l.organization_id
  from leads l
  where l.id = new.lead_id
    and l.status = 'contacted'
    and not exists (
      select 1 from outcomes o
      where o.lead_id = new.lead_id and o.stage = 'replied'
    )
    and public.business_days_between(new.sent_at, now()) >= 5;
  return new;
end;
$$;
