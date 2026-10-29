-- ============================================================================
-- I3 — Operational Scheduler (durable outbox)
--
-- Before this migration, accountability warnings existed only if a rep loaded
-- a page after the threshold time. `vercel.json` had five fixed-UTC crons and
-- none of them evaluated a warning, reset a day, closed a missed day or
-- scheduled a follow-up.
--
-- `operational_jobs` is the durable outbox the worker drains. Every row is
-- identified by a deterministic key, so a duplicate worker invocation (Vercel
-- retry, overlapping cron, two regions) is a no-op rather than a second
-- warning.
--
-- No authenticated write policy: the worker runs as the service role. Reads
-- are denied to authenticated users entirely — this is internal machinery, not
-- product surface.
-- ============================================================================

create table if not exists operational_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  -- The organization-local day the job belongs to.
  business_date date not null,
  -- Null for organization-level jobs (open day, close day, carryover).
  rep_id uuid references reps(id) on delete cascade,

  job_kind text not null check (job_kind in (
    'OPEN_DAY',
    'EVALUATE_REP_DAY',
    'EMIT_WARNING',
    'EMIT_ESCALATION',
    'CLOSE_MISSED_DAY',
    'PREPARE_CARRYOVER',
    'EVALUATE_FOLLOWUP',
    'ENQUEUE_EMAIL'
  )),

  -- The warning stage or hour bucket this job represents. Part of the key so
  -- "at 15:00" and "at 17:30" are different jobs, while a retry of either is
  -- the same job.
  time_bucket text not null default 'default',

  -- Deterministic identity: organization + date + rep + kind + bucket.
  dedupe_key text not null,

  state text not null default 'pending'
    check (state in ('pending', 'running', 'done', 'dead')),

  attempt int not null default 0 check (attempt >= 0),
  max_attempts int not null default 5 check (max_attempts > 0),
  last_error text,
  next_attempt_at timestamptz not null default now(),

  -- Trace correlation for observability.
  request_id text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,

  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, dedupe_key)
);

-- The worker's only hot query: due work, oldest first.
create index if not exists oj_due_idx
  on operational_jobs (next_attempt_at)
  where state = 'pending';

create index if not exists oj_org_date_idx
  on operational_jobs (organization_id, business_date desc);

create index if not exists oj_state_idx
  on operational_jobs (state, next_attempt_at);

alter table operational_jobs enable row level security;
-- Intentionally no policies: authenticated users cannot read or write the
-- scheduler. The service role bypasses RLS.

comment on table operational_jobs is
  'Durable operational outbox. Idempotent by (organization_id, dedupe_key); retried with backoff; dead-lettered after max_attempts.';

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   -- Idempotency: the same key twice must produce one row.
--   select organization_id, dedupe_key, count(*)
--   from operational_jobs group by 1, 2 having count(*) > 1;   -- zero rows
--
--   -- Dead letters must be visible, never silent.
--   select job_kind, state, attempt, last_error
--   from operational_jobs where state = 'dead';
-- ---------------------------------------------------------------------------
