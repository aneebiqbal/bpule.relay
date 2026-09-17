-- Repair: orchestration RPC functions
-- Migration 0086 created tables but the RPC functions were missing from the
-- remote database. This migration adds the four functions that the application
-- runtime calls: emit_relay_event, create_relay_run, transition_relay_run,
-- get_run_events.

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

  if v_caller_org_id is null or v_caller_org_id != p_org_id then
    raise exception 'emit_relay_event: cross-org denied. Caller org %, requested org %', v_caller_org_id, p_org_id;
  end if;

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
  select * into v_run from relay_runs where id = p_run_id and organization_id = p_org_id;
  if not found then
    raise exception 'transition_relay_run: run not found';
  end if;

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

  if not (v_valid_transitions -> v_run.status ? p_new_status) then
    raise exception 'transition_relay_run: invalid transition from % to %', v_run.status, p_new_status;
  end if;

  v_next_step := coalesce(p_new_step, p_new_status);

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
