-- Durable responsibility-transfer (team handoff) operations.
--
-- A handoff may span coverage, allocations, leads, tasks, applications and
-- acknowledgements, so it records its planned item set and per-item outcome.
-- One active operation per (organization, departing rep) prevents concurrent
-- transfers from fighting over the same seats.
--
-- Additive and idempotent.

create table if not exists responsibility_handoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  from_rep_id uuid not null references reps(id) on delete cascade,
  to_rep_id uuid not null references reps(id) on delete cascade,
  status text not null default 'planned'
    check (status in ('planned', 'running', 'completed', 'partial', 'failed')),
  plan jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text,
  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create unique index if not exists rho_one_active_from_idx
  on responsibility_handoffs (organization_id, from_rep_id)
  where status in ('planned', 'running');

create index if not exists rho_org_created_idx
  on responsibility_handoffs (organization_id, created_at desc);

alter table responsibility_handoffs enable row level security;

drop policy if exists "rho_select" on responsibility_handoffs;
create policy "rho_select" on responsibility_handoffs
  for select to authenticated using (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rho_insert" on responsibility_handoffs;
create policy "rho_insert" on responsibility_handoffs
  for insert to authenticated with check (organization_id = current_org_id() and is_org_admin());

-- Workers/update path uses the service role; clients never mutate status.

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role', 'relay_app', 'relay_service'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('grant select on responsibility_handoffs to %I', role_name);
      if role_name in ('service_role', 'relay_service') then
        execute format('grant insert, update, delete on responsibility_handoffs to %I', role_name);
      end if;
    end if;
  end loop;
end
$$;

comment on table responsibility_handoffs is
  'Durable team-handoff operation with planned items and per-item outcomes. Never deletes business history.';
