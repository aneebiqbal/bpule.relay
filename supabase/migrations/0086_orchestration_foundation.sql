-- 0086: Orchestration foundation — event ledger + relay runs
--
-- Adds the durable orchestration layer beneath the existing product:
--   1. relay_events: append-only business event ledger
--   2. relay_runs: persistent workflow envelope (OUTBOUND run type for Sprint 1)
--   3. emit_relay_event: centralized, idempotent event emission RPC
--
-- Existing domain tables (leads, messages, conversation_states, etc.) remain
-- authoritative current state. Events are immutable historical facts.
-- Relay Runs coordinate existing objects across time.
--
-- RLS: strict org isolation. Events are append-only — no UPDATE/DELETE for
-- any authenticated user. Insert only via controlled paths (app RPC or
-- trusted processor RPC).

-- ============================================================================
-- RELAY EVENTS — append-only business event ledger
-- ============================================================================

create table if not exists relay_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  -- Event classification
  event_type text not null,

  -- What entity this event describes
  entity_type text not null,
  entity_id uuid,

  -- Who triggered it
  actor_type text not null default 'system' check (actor_type in ('rep', 'admin', 'system', 'integration')),
  actor_id uuid,

  -- Revenue identity context (when applicable)
  revenue_identity_id uuid references revenue_identities(id) on delete set null,

  -- Source tracking for idempotency
  source text not null default 'app',
  source_event_id text,

  -- Workflow correlation
  correlation_id uuid,
  causation_id uuid references relay_events(id) on delete set null,

  -- Which run this event belongs to
  relay_run_id uuid,

  -- Contextual data (minimal — IDs and snapshot facts only)
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  -- Temporal
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Indexes for actual query patterns
create index if not exists re_org_time_idx on relay_events (organization_id, occurred_at desc);
create index if not exists re_org_type_time_idx on relay_events (organization_id, event_type, occurred_at desc);
create index if not exists re_entity_idx on relay_events (entity_type, entity_id, occurred_at desc) where entity_id is not null;
create index if not exists re_run_idx on relay_events (relay_run_id, occurred_at) where relay_run_id is not null;
create index if not exists re_correlation_idx on relay_events (correlation_id) where correlation_id is not null;
create index if not exists re_causation_idx on relay_events (causation_id) where causation_id is not null;
create index if not exists re_idempotency_idx on relay_events (organization_id, source, source_event_id) where source_event_id is not null;

alter table relay_events enable row level security;

-- SELECT: org members can read their own org's events
drop policy if exists "re_select" on relay_events;
create policy "re_select" on relay_events for select
  to authenticated using (organization_id = current_org_id());

-- No INSERT policy for direct user access — all inserts go through RPC
-- No UPDATE policy — events are append-only
-- No DELETE policy — events are immutable

-- ============================================================================
-- RELAY RUNS — persistent workflow envelope
-- ============================================================================

create table if not exists relay_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  -- Run classification
  run_type text not null default 'outbound' check (run_type in ('outbound', 'inbound', 'job')),

  -- What this run is about
  primary_entity_type text not null default 'lead',
  primary_entity_id uuid,

  -- Current orchestration state
  status text not null default 'detected' check (status in (
    'detected', 'qualifying', 'rejected', 'qualified',
    'routing', 'preparing', 'awaiting_human', 'action_recorded',
    'waiting', 'followup_due', 'followup_preparing',
    'response_received', 'conversation',
    'completed', 'failed', 'cancelled'
  )),
  current_step text not null default 'detect',

  -- Assignment
  assigned_rep_id uuid references reps(id) on delete set null,
  revenue_identity_id uuid references revenue_identities(id) on delete set null,

  -- Correlation (links all events in this run)
  correlation_id uuid not null default gen_random_uuid(),

  -- Temporal tracking
  started_at timestamptz not null default now(),
  waiting_until timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,

  -- Failure tracking
  failure_category text,
  failure_reason text,

  -- Context (minimal — references, not duplication)
  context jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rr_org_status_idx on relay_runs (organization_id, status);
create index if not exists rr_org_time_idx on relay_runs (organization_id, started_at desc);
create index if not exists rr_entity_idx on relay_runs (primary_entity_type, primary_entity_id) where primary_entity_id is not null;
create index if not exists rr_rep_idx on relay_runs (assigned_rep_id) where assigned_rep_id is not null;
create index if not exists rr_correlation_idx on relay_runs (correlation_id);
create index if not exists rr_active_idx on relay_runs (organization_id, status) where status not in ('completed', 'failed', 'cancelled', 'rejected');

alter table relay_runs enable row level security;

drop policy if exists "rr_select" on relay_runs;
create policy "rr_select" on relay_runs for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "rr_insert" on relay_runs;
create policy "rr_insert" on relay_runs for insert
  to authenticated with check (organization_id = current_org_id());

drop policy if exists "rr_update" on relay_runs;
create policy "rr_update" on relay_runs for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- ============================================================================
-- RPC: emit_relay_event
-- Centralized, idempotent event emission. Only way to insert events.
-- ============================================================================

create or replace function public.emit_relay_event(
  p_org_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_actor_type text default 'system',
  p_actor_id uuid default null,
  p_revenue_identity_id uuid default null,
  p_source text default 'app',
  p_source_event_id text default null,
  p_correlation_id uuid default null,
  p_causation_id uuid default null,
  p_relay_run_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_caller_org_id uuid;
begin
  v_caller_org_id := current_org_id();

  -- SECURITY: caller must belong to the org they're emitting for
  if v_caller_org_id is null or v_caller_org_id != p_org_id then
    raise exception 'emit_relay_event: cross-org denied. Caller org %, requested org %', v_caller_org_id, p_org_id;
  end if;

  -- Idempotency: if source + source_event_id already exists, return existing
  if p_source_event_id is not null then
    select id into v_event_id
    from relay_events
    where organization_id = p_org_id
      and source = p_source
      and source_event_id = p_source_event_id
    limit 1;

    if v_event_id is not null then
      return v_event_id;
    end if;
  end if;

  insert into relay_events (
    organization_id, event_type, entity_type, entity_id,
    actor_type, actor_id, revenue_identity_id,
    source, source_event_id, correlation_id, causation_id, relay_run_id,
    payload, metadata, occurred_at
  ) values (
    p_org_id, p_event_type, p_entity_type, p_entity_id,
    p_actor_type, p_actor_id, p_revenue_identity_id,
    p_source, p_source_event_id, p_correlation_id, p_causation_id, p_relay_run_id,
    p_payload, p_metadata, p_occurred_at
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- ============================================================================
-- RPC: create_relay_run
-- Creates a new Relay Run. Enforces one-active-run-per-entity rule.
-- ============================================================================

create or replace function public.create_relay_run(
  p_org_id uuid,
  p_run_type text default 'outbound',
  p_primary_entity_type text default 'lead',
  p_primary_entity_id uuid default null,
  p_assigned_rep_id uuid default null,
  p_revenue_identity_id uuid default null,
  p_correlation_id uuid default null,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_correlation uuid;
  v_caller_org_id uuid;
begin
  v_caller_org_id := current_org_id();

  if v_caller_org_id is null or v_caller_org_id != p_org_id then
    raise exception 'create_relay_run: cross-org denied';
  end if;

  v_correlation := coalesce(p_correlation_id, gen_random_uuid());

  -- One active run per entity: return existing if active
  if p_primary_entity_id is not null then
    select id into v_run_id
    from relay_runs
    where organization_id = p_org_id
      and run_type = p_run_type
      and primary_entity_id = p_primary_entity_id
      and status not in ('completed', 'failed', 'cancelled', 'rejected')
    limit 1;

    if v_run_id is not null then
      return v_run_id;
    end if;
  end if;

  insert into relay_runs (
    organization_id, run_type, primary_entity_type, primary_entity_id,
    status, current_step, assigned_rep_id, revenue_identity_id,
    correlation_id, context
  ) values (
    p_org_id, p_run_type, p_primary_entity_type, p_primary_entity_id,
    'detected', 'detect', p_assigned_rep_id, p_revenue_identity_id,
    v_correlation, p_context
  )
  returning id into v_run_id;

  return v_run_id;
end;
$$;

-- ============================================================================
-- RPC: transition_relay_run
-- Deterministic state transition with validation.
-- ============================================================================

create or replace function public.transition_relay_run(
  p_run_id uuid,
  p_org_id uuid,
  p_new_status text,
  p_new_step text default null,
  p_event_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run record;
  v_valid_transitions jsonb;
  v_next_step text;
begin
  -- Fetch the run
  select * into v_run from relay_runs where id = p_run_id and organization_id = p_org_id;
  if not found then
    raise exception 'transition_relay_run: run not found';
  end if;

  -- Define valid transitions (status -> allowed next statuses)
  v_valid_transitions := '{
    "detected": ["qualifying", "rejected", "cancelled"],
    "qualifying": ["qualified", "rejected", "cancelled"],
    "qualified": ["routing", "preparing", "cancelled"],
    "routing": ["preparing", "cancelled"],
    "preparing": ["awaiting_human", "cancelled"],
    "awaiting_human": ["action_recorded", "cancelled"],
    "action_recorded": ["waiting", "cancelled"],
    "waiting": ["followup_due", "response_received", "conversation", "cancelled"],
    "followup_due": ["followup_preparing", "cancelled"],
    "followup_preparing": ["awaiting_human", "cancelled"],
    "response_received": ["conversation", "cancelled"],
    "conversation": ["completed", "cancelled"],
    "rejected": [],
    "completed": [],
    "failed": [],
    "cancelled": []
  }'::jsonb;

  -- Validate transition
  if not (v_valid_transitions -> v_run.status ? p_new_status) then
    raise exception 'transition_relay_run: invalid transition from % to %', v_run.status, p_new_status;
  end if;

  -- Determine step
  v_next_step := coalesce(p_new_step, p_new_status);

  -- Apply transition
  update relay_runs set
    status = p_new_status,
    current_step = v_next_step,
    metadata = metadata || p_metadata,
    updated_at = now(),
    completed_at = case when p_new_status in ('completed', 'rejected') then now() else completed_at end,
    failed_at = case when p_new_status = 'failed' then now() else failed_at end
  where id = p_run_id and organization_id = p_org_id;

  return json_build_object(
    'run_id', p_run_id,
    'previous_status', v_run.status,
    'new_status', p_new_status,
    'step', v_next_step
  );
end;
$$;

-- ============================================================================
-- RPC: get_run_events
-- Returns the full event history for a run, ordered chronologically.
-- ============================================================================

create or replace function public.get_run_events(
  p_run_id uuid,
  p_org_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_org uuid;
begin
  select organization_id into v_run_org from relay_runs where id = p_run_id;
  if v_run_org is null or v_run_org != p_org_id then
    raise exception 'get_run_events: run not found or cross-org denied';
  end if;

  return (
    select json_agg(e order by e.occurred_at)
    from relay_events e
    where e.relay_run_id = p_run_id
  );
end;
$$;
