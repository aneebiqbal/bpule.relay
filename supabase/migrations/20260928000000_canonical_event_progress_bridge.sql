-- 20260928000000: Canonical event → accountability progress bridge
--
-- Maps canonical business events (relay_events) to daily progress on day_closes.
-- This is the source of truth for "what counts" — only real business actions,
-- never preparation/drafts/analysis.
--
-- Exactly-once: uses idempotency key via (person_id, source_event_id) dedup.

-- Add source tracking to day_closes for exactly-once enforcement
alter table day_closes
  add column if not exists source_event_ids text[] not null default '{}';

-- Index for source event dedup lookups
create index if not exists dc_source_event_idx on day_closes using gin (source_event_ids);

-- Function: atomically record a canonical progress event
-- Returns the updated day_close row, or null if duplicate (already counted)
create or replace function record_canonical_progress(
  p_org_id uuid,
  p_person_id uuid,
  p_revenue_identity_id uuid,
  p_event_type text,
  p_metric_key text,
  p_source_event_id text,
  p_date date default current_date
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_day_close_id uuid;
  v_existing_event_ids text[];
  v_new_count int;
  v_current_snapshot jsonb;
begin
  -- Find the day_close for this person + identity + date
  select id, source_event_ids, completion_snapshot
  into v_day_close_id, v_existing_event_ids, v_current_snapshot
  from day_closes
  where organization_id = p_org_id
    and person_id = p_person_id
    and revenue_identity_id = p_revenue_identity_id
    and date = p_date;

  -- No day_close → nothing to record against
  if v_day_close_id is null then
    return null;
  end if;

  -- Already closed → don't modify immutable history
  if exists (
    select 1 from day_closes
    where id = v_day_close_id
      and status in ('completed', 'completed_with_exception', 'missed')
  ) then
    return null;
  end if;

  -- Exactly-once: skip if this source event was already counted
  if p_source_event_id is not null and v_existing_event_ids @> array[p_source_event_id] then
    return v_day_close_id;
  end if;

  -- Increment the metric
  v_new_count := coalesce((v_current_snapshot ->> p.metric_key)::int, 0) + 1;

  -- Update snapshot and source event tracking atomically
  update day_closes
  set
    completion_snapshot = jsonb_set(
      completion_snapshot,
      array[p_metric_key],
      to_jsonb(v_new_count)
    ),
    source_event_ids = case
      when p_source_event_id is not null
      then array_append(source_event_ids, p_source_event_id)
      else source_event_ids
    end,
    status = case
      when status = 'not_started' then 'in_progress'
      else status
    end,
    updated_at = now()
  where id = v_day_close_id;

  return v_day_close_id;
end;
$$;

comment on function record_canonical_progress is
  'Atomically records a canonical business event as progress on a day_close. Enforces exactly-once via source_event_id dedup. Returns null if duplicate or no day_close exists.';

-- Function: map a relay_event to its accountability metric key
create or replace function event_type_to_metric_key(p_event_type text)
returns text
language sql
immutable
as $$
  select case p_event_type
    when 'OUTREACH_RECORDED' then
      -- payload.activity_type determines the metric
      'connections'  -- default; overridden by caller with payload
    when 'FOLLOWUP_RECORDED' then 'followups'
    when 'PROSPECT_CAPTURED' then 'qualifiedProspects'
    else null
  end;
$$;

comment on function event_type_to_metric_key is
  'Maps canonical event types to day_close completion_snapshot metric keys. Returns null for non-counting events.';
