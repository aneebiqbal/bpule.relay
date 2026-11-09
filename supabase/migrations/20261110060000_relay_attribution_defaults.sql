-- Relay runs and events derive their sender identity from the lead when the
-- caller does not supply one. Every emit/create call site passes the lead as
-- the primary entity, so attribution is now persisted without touching each
-- caller.

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

  -- Derive the sender identity from the lead when the caller omits it.
  if p_revenue_identity_id is null and p_entity_type = 'lead' and p_entity_id is not null then
    select revenue_identity_id into p_revenue_identity_id
      from leads
     where id = p_entity_id and organization_id = p_org_id;
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

  -- Derive the sender identity (and therefore the sender account) from the
  -- lead when the caller omits it.
  if p_revenue_identity_id is null and p_primary_entity_type = 'lead' and p_primary_entity_id is not null then
    select revenue_identity_id into p_revenue_identity_id
      from leads
     where id = p_primary_entity_id and organization_id = p_org_id;
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
