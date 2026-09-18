-- Repair: relay_events was created by 0088 as a stub (id, org, event_type,
-- actor_rep_id, metadata, created_at). emit_relay_event inserts the canonical
-- 0086 columns (source, entity_type, payload, …) and fails with
-- `column "source" does not exist`.
--
-- Additive and idempotent. Existing stub rows keep defaults.

alter table if exists relay_events
  add column if not exists entity_type text not null default 'unknown';

alter table if exists relay_events
  add column if not exists entity_id uuid;

alter table if exists relay_events
  add column if not exists actor_type text not null default 'system';

alter table if exists relay_events
  add column if not exists actor_id uuid;

alter table if exists relay_events
  add column if not exists revenue_identity_id uuid references revenue_identities(id) on delete set null;

alter table if exists relay_events
  add column if not exists source text not null default 'app';

alter table if exists relay_events
  add column if not exists source_event_id text;

alter table if exists relay_events
  add column if not exists correlation_id uuid;

alter table if exists relay_events
  add column if not exists causation_id uuid;

alter table if exists relay_events
  add column if not exists relay_run_id uuid;

alter table if exists relay_events
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table if exists relay_events
  add column if not exists occurred_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'relay_events' and column_name = 'metadata'
  ) then
    update relay_events set metadata = '{}'::jsonb where metadata is null;
    alter table relay_events alter column metadata set default '{}'::jsonb;
    alter table relay_events alter column metadata set not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'relay_events_actor_type_check'
  ) then
    alter table relay_events
      add constraint relay_events_actor_type_check
      check (actor_type in ('rep', 'admin', 'system', 'integration'));
  end if;
end $$;

create index if not exists re_org_time_idx on relay_events (organization_id, occurred_at desc);
create index if not exists re_org_type_time_idx on relay_events (organization_id, event_type, occurred_at desc);
create index if not exists re_entity_idx on relay_events (entity_type, entity_id, occurred_at desc) where entity_id is not null;
create index if not exists re_run_idx on relay_events (relay_run_id, occurred_at) where relay_run_id is not null;
create index if not exists re_correlation_idx on relay_events (correlation_id) where correlation_id is not null;
create index if not exists re_causation_idx on relay_events (causation_id) where causation_id is not null;
create index if not exists re_idempotency_idx on relay_events (organization_id, source, source_event_id) where source_event_id is not null;
