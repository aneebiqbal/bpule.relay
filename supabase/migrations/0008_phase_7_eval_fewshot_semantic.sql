-- Phase 7 schema: eval harness, few-shot wins, semantic proof matching with pgvector.

-- ============================================================================
-- pgvector extension for embeddings
-- ============================================================================

create extension if not exists vector;

-- ============================================================================
-- Golden set: curated real leads with known outcomes for prompt evaluation.
-- ============================================================================

create table golden_set (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) not null,
  message_id uuid references messages(id),
  -- The known outcome for this case: did the prospect reply?
  known_replied boolean not null,
  -- The message text that was actually sent (the human may have edited the draft).
  sent_text text,
  -- Optional: why this case was included in the golden set.
  note text,
  -- Whether this row is active in eval runs.
  active boolean default true,
  created_at timestamptz default now()
);

create index golden_set_lead_idx on golden_set (lead_id);
create index golden_set_active_idx on golden_set (active);

-- ============================================================================
-- Eval runs: score a prompt version against the golden set.
-- ============================================================================

create table eval_runs (
  id uuid primary key default gen_random_uuid(),
  prompt_version text not null,
  -- Scores out of the golden set size.
  golden_set_size int not null,
  reply_rate_score int not null,
  selfcheck_pass_rate int not null,
  company_mention_rate int not null,
  evidence_mention_rate int not null,
  -- Overall score (0-100) computed from the components.
  overall_score int not null,
  -- Raw JSON log of per-case results for debugging.
  details jsonb,
  created_at timestamptz default now()
);

-- ============================================================================
-- Proof items: add embedding vector for semantic search.
-- ============================================================================

alter table proof_items add column embedding vector(384);

-- Index for cosine-similarity search on proof embeddings.
create index proof_items_embedding_idx on proof_items using hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- Few-shot wins: indexed view of sent messages that got replies.
-- We keep this denormalized for fast lookup at draft time.
-- ============================================================================

create table few_shot_wins (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id) not null unique,
  lead_id uuid references leads(id) not null,
  play_id uuid references plays(id),
  signal_type int,
  -- The actual sent text that got a reply.
  sent_text text not null,
  -- Context the model needs to understand why this example was selected.
  company text not null,
  signal_evidence text,
  tags text[] default '{}',
  -- When this win was logged; we can refresh the pool periodically.
  created_at timestamptz default now()
);

create index few_shot_wins_play_idx on few_shot_wins (play_id);
create index few_shot_wins_signal_idx on few_shot_wins (signal_type);
create index few_shot_wins_tags_idx on few_shot_wins using gin (tags);

-- ============================================================================
-- RLS
-- ============================================================================

alter table golden_set enable row level security;
alter table eval_runs enable row level security;
alter table few_shot_wins enable row level security;

-- Admin-only write, all authenticated read for golden set and eval runs.
create policy golden_set_select on golden_set for select
  to authenticated using (auth.role() = 'authenticated');
create policy golden_set_admin_write on golden_set for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

create policy eval_runs_select on eval_runs for select
  to authenticated using (auth.role() = 'authenticated');
create policy eval_runs_admin_write on eval_runs for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

create policy few_shot_wins_select on few_shot_wins for select
  to authenticated using (auth.role() = 'authenticated');
create policy few_shot_wins_admin_write on few_shot_wins for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Function: refresh few-shot wins from messages + outcomes.
-- Run this after enough new reply data accumulates (e.g., nightly or weekly).
-- ============================================================================

create or replace function public.refresh_few_shot_wins()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
begin
  insert into few_shot_wins (message_id, lead_id, play_id, signal_type, sent_text, company, signal_evidence, tags)
  select
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
-- Function: cosine-similarity match for proof items.
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
    and 1 - (p.embedding <=> query_embedding) > match_threshold
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================================
-- Seed: mark a few demo messages as wins for local testing.
-- ============================================================================

select public.refresh_few_shot_wins();

-- Add one demo row to golden set so the eval harness UI is not empty on first run.
insert into golden_set (lead_id, message_id, known_replied, sent_text, note, active)
select
  'ffffffff-0000-0000-0000-000000000001'::uuid,
  '99999999-0000-0000-0000-000000000001'::uuid,
  true,
  'Hey Priya, saw your post about the backlog. We help teams like yours take a product off their shoulders. Want a quick read on your mobile app? Best.',
  'Demo seed: this message got a reply in the demo data.',
  true
where exists (select 1 from leads where id = 'ffffffff-0000-0000-0000-000000000001'::uuid)
  and not exists (select 1 from golden_set where lead_id = 'ffffffff-0000-0000-0000-000000000001'::uuid);
