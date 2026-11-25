-- Per-rep available working minutes per business day.
--
-- Nullable means "not configured": the UI must show "Capacity not configured"
-- rather than inventing an eight-hour default.
--
-- Additive and idempotent.

create table if not exists rep_capacity_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  available_minutes integer check (available_minutes is null or (available_minutes > 0 and available_minutes <= 1440)),
  updated_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, rep_id)
);

create index if not exists rcs_org_idx on rep_capacity_settings (organization_id);

alter table rep_capacity_settings enable row level security;

drop policy if exists "rcs_select" on rep_capacity_settings;
create policy "rcs_select" on rep_capacity_settings
  for select to authenticated using (organization_id = current_org_id());

drop policy if exists "rcs_insert" on rep_capacity_settings;
create policy "rcs_insert" on rep_capacity_settings
  for insert to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rcs_update" on rep_capacity_settings;
create policy "rcs_update" on rep_capacity_settings
  for update to authenticated
  using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

grant select, insert, update on rep_capacity_settings to authenticated;
do $$
declare
  role_name text;
begin
  foreach role_name in array array['service_role', 'relay_service'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('grant select, insert, update, delete on rep_capacity_settings to %I', role_name);
    end if;
  end loop;
end
$$;

comment on table rep_capacity_settings is
  'Configured available working minutes per rep per business day. NULL = not configured (never assume 480).';
