-- RELAY V7 — Operator contribution allocations (SHARED vs ALLOCATED plans).
--
-- The plan requirement already belongs to the CHANNEL identity (V6.1) and is
-- counted once. This adds an OPTIONAL per-operator expectation under that shared
-- lane — it never creates a second requirement and never duplicates the plan.
--
--   SHARED PLAN   → no rows; every operator contributes toward one requirement.
--   ALLOCATED     → one row per (lane, operator) with their expected share.
--
-- Invariants enforced by the application (cross-row sums cannot be a table
-- constraint without a trigger):
--   * allocations are children of the shared lane (plan_id → daily_target_plans)
--   * sum(allocations) per lane <= plan.target_count
--   * a lane may be allocated OR shared, never both

create table if not exists daily_plan_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  plan_id uuid not null references daily_target_plans(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,

  target_count int not null check (target_count > 0),
  active boolean not null default true,

  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active allocation per (lane, operator). Deactivating the previous row on
-- edit is what makes a resubmit a no-op rather than a second seat.
create unique index if not exists dpa_active_uniq
  on daily_plan_allocations (plan_id, rep_id)
  where active;

create index if not exists dpa_org_idx on daily_plan_allocations (organization_id, active);
create index if not exists dpa_rep_idx on daily_plan_allocations (rep_id);

alter table daily_plan_allocations enable row level security;

drop policy if exists "dpa_select" on daily_plan_allocations;
create policy "dpa_select" on daily_plan_allocations
  for select to authenticated using (
    organization_id = current_org_id()
    and (
      is_org_admin()
      or exists (
        select 1 from daily_target_plans p
        join revenue_identities ri on ri.id = p.revenue_identity_id
        join profile_coverage pc on pc.profile_id = ri.profile_id
        where p.id = daily_plan_allocations.plan_id
          and pc.rep_id = current_rep_id()
          and pc.active
      )
    )
  );

drop policy if exists "dpa_insert" on daily_plan_allocations;
create policy "dpa_insert" on daily_plan_allocations
  for insert to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "dpa_update" on daily_plan_allocations;
create policy "dpa_update" on daily_plan_allocations
  for update to authenticated
  using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "dpa_delete" on daily_plan_allocations;
create policy "dpa_delete" on daily_plan_allocations
  for delete to authenticated using (organization_id = current_org_id() and is_org_admin());

comment on table daily_plan_allocations is
  'Optional per-operator expectation under a shared channel plan. SHARED plans have no rows; ALLOCATED plans have one row per (lane, operator) and the sum never exceeds the lane target.';
