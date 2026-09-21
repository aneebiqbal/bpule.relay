-- 20260921: Accountability OS — contracts, templates, day closes, reviews, rewards
--
-- Extends the Revenue Identity OS with the full accountability layer:
--   1. accountability_templates — reusable operating contract presets
--   2. revenue_identity_contracts — versioned contracts per identity
--   3. contract_allocations — workload split across operators
--   4. day_closes — explicit daily accountability records
--   5. monthly_accountability_reviews — month-end review snapshots
--   6. reward_policies — organization-configurable reward tiers
--   7. reward_eligibility — computed eligibility per review
--   8. operator_availability — leave/holiday tracking
--
-- All tables are tenant-scoped via organization_id with RLS.

-- ============================================================================
-- ACCOUNTABILITY TEMPLATES
-- ============================================================================

create table if not exists accountability_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  qualified_prospects int not null default 50,
  connections int not null default 25,
  first_dms int not null default 30,
  emails int not null default 30,
  followups int not null default 25,
  due_replies_pct int not null default 100,
  meaningful_touches int not null default 90,
  logging_completeness_pct int not null default 100,
  is_default boolean not null default false,
  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists atpl_org_idx on accountability_templates (organization_id);
alter table accountability_templates enable row level security;

drop policy if exists "atpl_select" on accountability_templates;
create policy "atpl_select" on accountability_templates for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "atpl_insert" on accountability_templates;
create policy "atpl_insert" on accountability_templates for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "atpl_update" on accountability_templates;
create policy "atpl_update" on accountability_templates for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "atpl_delete" on accountability_templates;
create policy "atpl_delete" on accountability_templates for delete
  to authenticated using (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- REVENUE IDENTITY CONTRACTS
-- ============================================================================

create table if not exists revenue_identity_contracts (
  id uuid primary key default gen_random_uuid(),
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  template_id uuid references accountability_templates(id) on delete set null,
  annual_revenue_target int not null default 100000,
  qualified_prospects int not null default 50,
  connections int not null default 25,
  first_dms int not null default 30,
  emails int not null default 30,
  followups int not null default 25,
  due_replies_pct int not null default 100,
  meaningful_touches int not null default 90,
  logging_completeness_pct int not null default 100,
  effective_from date not null default current_date,
  effective_to date,
  status text not null default 'active' check (status in ('active', 'superseded', 'archived')),
  version int not null default 1,
  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ric_identity_idx on revenue_identity_contracts (revenue_identity_id);
create index if not exists ric_status_idx on revenue_identity_contracts (revenue_identity_id, status);
create index if not exists ric_effective_idx on revenue_identity_contracts (revenue_identity_id, effective_from);
alter table revenue_identity_contracts enable row level security;

drop policy if exists "ric_select" on revenue_identity_contracts;
create policy "ric_select" on revenue_identity_contracts for select
  to authenticated using (
    revenue_identity_id in (
      select id from revenue_identities where organization_id = current_org_id()
    )
  );

drop policy if exists "ric_insert" on revenue_identity_contracts;
create policy "ric_insert" on revenue_identity_contracts for insert
  to authenticated with check (
    revenue_identity_id in (
      select id from revenue_identities where organization_id = current_org_id()
    ) and is_org_admin()
  );

drop policy if exists "ric_update" on revenue_identity_contracts;
create policy "ric_update" on revenue_identity_contracts for update
  to authenticated using (
    revenue_identity_id in (
      select id from revenue_identities where organization_id = current_org_id()
    ) and is_org_admin()
  ) with check (
    revenue_identity_id in (
      select id from revenue_identities where organization_id = current_org_id()
    ) and is_org_admin()
  );

-- ============================================================================
-- CONTRACT ALLOCATIONS
-- ============================================================================

create table if not exists contract_allocations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references revenue_identity_contracts(id) on delete cascade,
  person_id uuid not null references reps(id) on delete cascade,
  allocation_pct int not null check (allocation_pct > 0 and allocation_pct <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, person_id)
);

create index if not exists ca_contract_idx on contract_allocations (contract_id);
create index if not exists ca_person_idx on contract_allocations (person_id);
alter table contract_allocations enable row level security;

drop policy if exists "ca_select" on contract_allocations;
create policy "ca_select" on contract_allocations for select
  to authenticated using (
    contract_id in (
      select id from revenue_identity_contracts
      where revenue_identity_id in (
        select id from revenue_identities where organization_id = current_org_id()
      )
    )
  );

drop policy if exists "ca_insert" on contract_allocations;
create policy "ca_insert" on contract_allocations for insert
  to authenticated with check (
    contract_id in (
      select id from revenue_identity_contracts
      where revenue_identity_id in (
        select id from revenue_identities where organization_id = current_org_id()
      )
    ) and is_org_admin()
  );

drop policy if exists "ca_update" on contract_allocations;
create policy "ca_update" on contract_allocations for update
  to authenticated using (
    contract_id in (
      select id from revenue_identity_contracts
      where revenue_identity_id in (
        select id from revenue_identities where organization_id = current_org_id()
      )
    ) and is_org_admin()
  ) with check (
    contract_id in (
      select id from revenue_identity_contracts
      where revenue_identity_id in (
        select id from revenue_identities where organization_id = current_org_id()
      )
    ) and is_org_admin()
  );

drop policy if exists "ca_delete" on contract_allocations;
create policy "ca_delete" on contract_allocations for delete
  to authenticated using (
    contract_id in (
      select id from revenue_identity_contracts
      where revenue_identity_id in (
        select id from revenue_identities where organization_id = current_org_id()
      )
    ) and is_org_admin()
  );

-- ============================================================================
-- DAY CLOSES
-- ============================================================================

create table if not exists day_closes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  person_id uuid not null references reps(id) on delete cascade,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  contract_id uuid references revenue_identity_contracts(id) on delete set null,
  date date not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'ready_to_close', 'completed', 'completed_with_exception', 'missed')),
  completion_snapshot jsonb not null default '{}'::jsonb,
  exception_reason text check (exception_reason in ('no_qualified_inventory', 'channel_limit', 'identity_blocked', 'system_issue', 'client_priority', 'manager_approved', 'other')),
  exception_note text,
  reviewed_by uuid references reps(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, revenue_identity_id, date)
);

create index if not exists dc_org_date_idx on day_closes (organization_id, date desc);
create index if not exists dc_person_date_idx on day_closes (person_id, date desc);
create index if not exists dc_identity_date_idx on day_closes (revenue_identity_id, date desc);
create index if not exists dc_status_idx on day_closes (organization_id, status);
alter table day_closes enable row level security;

drop policy if exists "dc_select" on day_closes;
create policy "dc_select" on day_closes for select
  to authenticated using (
    organization_id = current_org_id()
    and (person_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin())
  );

drop policy if exists "dc_insert" on day_closes;
create policy "dc_insert" on day_closes for insert
  to authenticated with check (
    organization_id = current_org_id()
    and (person_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin())
  );

drop policy if exists "dc_update" on day_closes;
create policy "dc_update" on day_closes for update
  to authenticated using (
    organization_id = current_org_id()
    and (person_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin())
  ) with check (
    organization_id = current_org_id()
    and (person_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin())
  );

-- ============================================================================
-- MONTHLY ACCOUNTABILITY REVIEWS
-- ============================================================================

create table if not exists monthly_accountability_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  person_id uuid not null references reps(id) on delete cascade,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  contract_id uuid references revenue_identity_contracts(id) on delete set null,
  month date not null,
  execution_snapshot jsonb not null default '{}'::jsonb,
  quality_snapshot jsonb not null default '{}'::jsonb,
  outcome_snapshot jsonb not null default '{}'::jsonb,
  consistency_snapshot jsonb not null default '{}'::jsonb,
  review_status text not null default 'pending' check (review_status in ('pending', 'in_review', 'completed', 'adjusted')),
  manager_note text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, revenue_identity_id, month)
);

create index if not exists mar_org_month_idx on monthly_accountability_reviews (organization_id, month desc);
create index if not exists mar_person_idx on monthly_accountability_reviews (person_id, month desc);
create index if not exists mar_identity_idx on monthly_accountability_reviews (revenue_identity_id, month desc);
create index if not exists mar_status_idx on monthly_accountability_reviews (organization_id, review_status);
alter table monthly_accountability_reviews enable row level security;

drop policy if exists "mar_select" on monthly_accountability_reviews;
create policy "mar_select" on monthly_accountability_reviews for select
  to authenticated using (
    organization_id = current_org_id()
    and (person_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin())
  );

drop policy if exists "mar_insert" on monthly_accountability_reviews;
create policy "mar_insert" on monthly_accountability_reviews for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "mar_update" on monthly_accountability_reviews;
create policy "mar_update" on monthly_accountability_reviews for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- REWARD POLICIES
-- ============================================================================

create table if not exists reward_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  tier text not null check (tier in ('bronze', 'silver', 'gold')),
  criteria jsonb not null default '{}'::jsonb,
  reward_type text not null check (reward_type in ('custom', 'bonus_eligibility', 'commission_review', 'time_off_review', 'gift_review', 'recognition_only')),
  description text,
  enabled boolean not null default true,
  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists rp_org_idx on reward_policies (organization_id);
alter table reward_policies enable row level security;

drop policy if exists "rp_select" on reward_policies;
create policy "rp_select" on reward_policies for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "rp_insert" on reward_policies;
create policy "rp_insert" on reward_policies for insert
  to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rp_update" on reward_policies;
create policy "rp_update" on reward_policies for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "rp_delete" on reward_policies;
create policy "rp_delete" on reward_policies for delete
  to authenticated using (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- REWARD ELIGIBILITY
-- ============================================================================

create table if not exists reward_eligibility (
  id uuid primary key default gen_random_uuid(),
  monthly_review_id uuid not null references monthly_accountability_reviews(id) on delete cascade,
  policy_id uuid not null references reward_policies(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'adjusted')),
  reason_snapshot jsonb not null default '{}'::jsonb,
  approved_by uuid references reps(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (monthly_review_id, policy_id)
);

create index if not exists re_review_idx on reward_eligibility (monthly_review_id);
create index if not exists re_policy_idx on reward_eligibility (policy_id);
create index if not exists re_status_idx on reward_eligibility (status);
alter table reward_eligibility enable row level security;

drop policy if exists "re_select" on reward_eligibility;
create policy "re_select" on reward_eligibility for select
  to authenticated using (
    monthly_review_id in (
      select id from monthly_accountability_reviews
      where organization_id = current_org_id()
    )
  );

drop policy if exists "re_insert" on reward_eligibility;
create policy "re_insert" on reward_eligibility for insert
  to authenticated with check (
    monthly_review_id in (
      select id from monthly_accountability_reviews
      where organization_id = current_org_id()
    ) and is_org_admin()
  );

drop policy if exists "re_update" on reward_eligibility;
create policy "re_update" on reward_eligibility for update
  to authenticated using (
    monthly_review_id in (
      select id from monthly_accountability_reviews
      where organization_id = current_org_id()
    ) and is_org_admin()
  ) with check (
    monthly_review_id in (
      select id from monthly_accountability_reviews
      where organization_id = current_org_id()
    ) and is_org_admin()
  );

-- ============================================================================
-- OPERATOR AVAILABILITY
-- ============================================================================

create table if not exists operator_availability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  person_id uuid not null references reps(id) on delete cascade,
  date date not null,
  status text not null default 'working' check (status in ('working', 'leave', 'holiday', 'approved_unavailable')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, date)
);

create index if not exists oa_org_date_idx on operator_availability (organization_id, date);
create index if not exists oa_person_date_idx on operator_availability (person_id, date);
alter table operator_availability enable row level security;

drop policy if exists "oa_select" on operator_availability;
create policy "oa_select" on operator_availability for select
  to authenticated using (
    organization_id = current_org_id()
    and (person_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin())
  );

drop policy if exists "oa_insert" on operator_availability;
create policy "oa_insert" on operator_availability for insert
  to authenticated with check (
    organization_id = current_org_id()
    and (person_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin())
  );

drop policy if exists "oa_update" on operator_availability;
create policy "oa_update" on operator_availability for update
  to authenticated using (
    organization_id = current_org_id()
    and (person_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin())
  ) with check (
    organization_id = current_org_id()
    and (person_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin())
  );

-- ============================================================================
-- SEED: Default templates
-- ============================================================================

do $$
declare
  org_id uuid;
begin
  select id into org_id from organizations limit 1;
  if org_id is null then return; end if;

  insert into accountability_templates (organization_id, name, qualified_prospects, connections, first_dms, emails, followups, due_replies_pct, meaningful_touches, logging_completeness_pct, is_default) values
    (org_id, 'LIGHT', 20, 10, 15, 15, 10, 100, 40, 100, false),
    (org_id, 'STANDARD', 35, 18, 22, 22, 18, 100, 65, 100, false),
    (org_id, 'HIGH_OUTPUT', 50, 25, 30, 30, 25, 100, 90, 100, true),
    (org_id, 'CUSTOM', 0, 0, 0, 0, 0, 100, 0, 100, false)
  on conflict (organization_id, name) do nothing;
end $$;
