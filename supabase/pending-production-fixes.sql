-- =============================================================================
-- PENDING PRODUCTION FIXES — Run this in Supabase SQL Editor
-- https://console.neuro.tech → SQL Editor → New Query
-- =============================================================================

-- 0. CRITICAL: Add missing revenue_identity_id column to relay_runs
--    Migration 20260917180000 was not applied to production, causing
--    "column revenue_identity_id of relation relay_runs does not exist" on save.
alter table relay_runs
  add column if not exists status text not null default 'detected';

alter table relay_runs
  add column if not exists current_step text not null default 'detect';

alter table relay_runs
  add column if not exists revenue_identity_id uuid references revenue_identities(id) on delete set null;

alter table relay_runs
  add column if not exists correlation_id uuid not null default gen_random_uuid();

alter table relay_runs
  add column if not exists waiting_until timestamptz;

alter table relay_runs
  add column if not exists completed_at timestamptz;

alter table relay_runs
  add column if not exists failed_at timestamptz;

alter table relay_runs
  add column if not exists failure_category text;

alter table relay_runs
  add column if not exists failure_reason text;

alter table relay_runs
  add column if not exists context jsonb not null default '{}'::jsonb;

alter table relay_runs
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists rr_org_status_idx on relay_runs (organization_id, status);
create index if not exists rr_active_idx on relay_runs (organization_id, status) where status not in ('completed', 'failed', 'cancelled', 'rejected');
create index if not exists rr_entity_idx on relay_runs (primary_entity_type, primary_entity_id) where primary_entity_id is not null;
create index if not exists rr_rep_idx on relay_runs (assigned_rep_id) where assigned_rep_id is not null;
create index if not exists rr_correlation_idx on relay_runs (correlation_id);

-- 1. Fix timestamptz typo in emit_relay_event (migration 20261001000004 was applied
--    with the typo "timestamz" which would cause runtime errors when called)
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
  p_occurred_at timestamptz default now()
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

-- =============================================================================
-- VERIFICATION — Run after applying the above
-- =============================================================================

-- Verify the function exists and has correct signature
select proname, format_type(oid, NULL) as return_type
from pg_proc
where proname = 'emit_relay_event';

-- Verify voice_profiles has profile_id column (from migration 20261002000000)
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'voice_profiles'
order by ordinal_position;

-- Verify ai_traces has the new columns (from migration 20261003000000)
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'ai_traces'
order by ordinal_position;

-- Verify relay_runs has revenue_identity_id (fix #0 above)
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'relay_runs'
order by ordinal_position;
