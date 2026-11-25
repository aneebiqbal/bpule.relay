-- Audited retention maintenance runs.
-- Additive and idempotent. Only ephemeral/reconstructable classes are ever
-- deleted by the executor; protected business history is never a candidate.

create table if not exists retention_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  requested_by uuid references reps(id) on delete set null,
  dry_run boolean not null default true,
  status text not null default 'completed' check (status in ('completed', 'partial', 'failed')),
  policy_version integer not null default 1,
  preview jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists retention_runs_org_created_idx
  on retention_runs (organization_id, created_at desc);

alter table retention_runs enable row level security;

drop policy if exists "rr_select" on retention_runs;
create policy "rr_select" on retention_runs
  for select to authenticated using (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rr_insert" on retention_runs;
create policy "rr_insert" on retention_runs
  for insert to authenticated with check (organization_id = current_org_id() and is_org_admin());

do $$
declare
  role_name text;
begin
  foreach role_name in array array['authenticated', 'service_role', 'relay_app', 'relay_service'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('grant select on retention_runs to %I', role_name);
      if role_name in ('service_role', 'relay_service') then
        execute format('grant insert, update, delete on retention_runs to %I', role_name);
      end if;
    end if;
  end loop;
end
$$;
