-- 20261001-000004: Exactly-once accountability progress
--
-- P0-4 HARDENING: record_activity_event incremented unconditionally on
-- every call. A retry, double-click, or duplicate client request produced
-- a second daily_accountability.completed_count +1 with no way to dedupe.
--
-- Fix: add an optional p_source_event_id argument. When supplied the RPC
-- checks a new daily_accountability.source_event_ids text[] column and
-- refuses to increment if the event is already recorded. This mirrors the
-- canonical-event dedupe pattern already used by record_canonical_progress
-- (day_closes.source_event_ids @> check).
--
-- Also widens relay_events re_idempotency_idx to a UNIQUE index so
-- emit_relay_event's sourceEventId dedupe actually holds at the DB layer.

-- ---------------------------------------------------------------------------
-- 1. daily_accountability: source_event_ids + GIN index
-- ---------------------------------------------------------------------------

alter table daily_accountability
  add column if not exists source_event_ids text[] not null default '{}';

create index if not exists daily_accountability_source_event_ids_idx
  on daily_accountability using gin (source_event_ids);

-- ---------------------------------------------------------------------------
-- 2. record_activity_event: optional idempotency via source_event_id
-- ---------------------------------------------------------------------------

create or replace function public.record_activity_event(
  p_rep_id uuid,
  p_identity_id uuid,
  p_activity_type text,
  p_org_id uuid,
  p_source_event_id text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
  v_target_count int;
  v_completed int;
  v_status text;
  v_existing_id uuid;
  v_is_working boolean;
  v_already_recorded boolean;
begin
  -- Exactly-once: if caller supplied a source_event_id and this
  -- accountability row already contains it, return the current state
  -- without incrementing.
  if p_source_event_id is not null then
    select source_event_ids @> array[p_source_event_id]
    into v_already_recorded
    from daily_accountability
    where rep_id = p_rep_id
      and revenue_identity_id = p_identity_id
      and activity_type = p_activity_type
      and target_date = current_date
    limit 1;

    if v_already_recorded then
      select completed_count, target_count
      into v_completed, v_target_count
      from daily_accountability
      where rep_id = p_rep_id
        and revenue_identity_id = p_identity_id
        and activity_type = p_activity_type
        and target_date = current_date
      limit 1;
      return json_build_object(
        'recorded', false,
        'reason', 'already_recorded',
        'completed_count', coalesce(v_completed, 0),
        'target_count', coalesce(v_target_count, 0)
      );
    end if;
  end if;

  v_date := current_date;
  v_is_working := public.is_org_working_day(p_org_id, v_date);

  if not v_is_working then
    return json_build_object('recorded', false, 'reason', 'not_working_day');
  end if;

  select coalesce(
    (select target_count from daily_targets
     where rep_id = p_rep_id
       and revenue_identity_id = p_identity_id
       and activity_type = p_activity_type
       and active = true
     limit 1),
    0
  ) into v_target_count;

  insert into daily_accountability (
    organization_id, rep_id, revenue_identity_id, activity_type,
    target_date, target_count, completed_count, status, closed, source_event_ids
  ) values (
    p_org_id, p_rep_id, p_identity_id, p_activity_type,
    v_date, v_target_count, 1, 'on_track', false,
    case when p_source_event_id is not null
         then array[p_source_event_id]
         else '{}'::text[] end
  )
  on conflict (rep_id, revenue_identity_id, activity_type, target_date)
  do update set
    completed_count = daily_accountability.completed_count + 1,
    source_event_ids = case
      when p_source_event_id is not null
           and not (daily_accountability.source_event_ids @> array[p_source_event_id])
      then array_append(daily_accountability.source_event_ids, p_source_event_id)
      else daily_accountability.source_event_ids
    end,
    updated_at = now()
  where daily_accountability.closed = false
  returning id, completed_count, target_count into v_existing_id, v_completed, v_target_count;

  if v_completed >= v_target_count and v_target_count > 0 then
    v_status := 'completed';
  else
    v_status := 'on_track';
  end if;

  update daily_accountability set status = v_status where id = v_existing_id;

  return json_build_object(
    'recorded', true,
    'completed_count', v_completed,
    'target_count', v_target_count,
    'status', v_status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. relay_events: unique index on (org, source, source_event_id)
--    The application layer (emit_relay_event RPC) already does SELECT-then-
--    INSERT dedup, but a unique index adds a hard DB-level guarantee: even a
--    concurrent duplicate (two tabs, race window) cannot insert a second row.
-- ---------------------------------------------------------------------------

drop index if exists public.re_idempotency_idx;
create unique index if not exists re_idempotency_unique_idx
  on relay_events(organization_id, source, source_event_id)
  where source_event_id is not null;

-- ---------------------------------------------------------------------------
-- 4. emit_relay_event: tolerate unique-violation on concurrent duplicate
-- ---------------------------------------------------------------------------

create or replace function public.emit_relay_event(
  p_event_type text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_actor_type text default null,
  p_actor_id text default null,
  p_revenue_identity_id text default null,
  p_source text default null,
  p_source_event_id text default null,
  p_correlation_id text default null,
  p_causation_id text default null,
  p_relay_run_id text default null,
  p_payload jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_event_id uuid;
begin
  v_org_id := public.current_org_id();
  if v_org_id is null then raise exception 'No organization in context'; end if;

  -- Idempotency: if source + source_event_id already exists, return existing
  if p_source_event_id is not null then
    select id into v_event_id
    from relay_events
    where organization_id = v_org_id
      and source = p_source
      and source_event_id = p_source_event_id
    limit 1;

    if v_event_id is not null then
      return v_event_id;
    end if;
  end if;

  begin
    insert into relay_events (
      organization_id, event_type, entity_type, entity_id,
      actor_type, actor_id, revenue_identity_id,
      source, source_event_id, correlation_id, causation_id, relay_run_id,
      payload, metadata, occurred_at
    ) values (
      v_org_id, p_event_type, p_entity_type, p_entity_id,
      p_actor_type, p_actor_id, p_revenue_identity_id,
      p_source, p_source_event_id, p_correlation_id, p_causation_id, p_relay_run_id,
      p_payload, p_metadata, p_occurred_at
    )
    returning id into v_event_id;
  exception
    when unique_violation then
      select id into v_event_id
      from relay_events
      where organization_id = v_org_id
        and source = p_source
        and source_event_id = p_source_event_id
      limit 1;
  end;

  return v_event_id;
end;
$$;
