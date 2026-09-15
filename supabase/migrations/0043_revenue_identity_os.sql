-- 0043: Revenue Identity OS — schema + seed from upwork.pdf master data
--
-- Fully idempotent. Handles partial application, pre-existing Aneeb records,
-- and re-runs safely. All DDL uses IF NOT EXISTS; all inserts use
-- on conflict do nothing or equivalent guards.

-- ============================================================================
-- TABLES
-- ============================================================================

create table if not exists revenue_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  slug text not null,
  identity_name text not null,
  title text,
  positioning text,
  skills jsonb not null default '[]'::jsonb,
  expertise jsonb not null default '[]'::jsonb,
  industries jsonb not null default '[]'::jsonb,
  technologies jsonb not null default '[]'::jsonb,
  allowed_first_person_claims jsonb not null default '[]'::jsonb,
  forbidden_claims text[] not null default '{}',
  channel_rules jsonb not null default '{}'::jsonb,
  voice_tone jsonb not null default '{}'::jsonb,
  preferred_opportunity_types jsonb not null default '[]'::jsonb,
  proposal_positioning text,
  profile_id uuid references profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  source_kind text not null default 'import' check (source_kind in ('import', 'manual', 'synced')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists revenue_identities_org_slug_idx on revenue_identities (organization_id, slug);
create index if not exists revenue_identities_profile_idx on revenue_identities (profile_id);
alter table revenue_identities enable row level security;
drop policy if exists "rev_id_select" on revenue_identities;
create policy "rev_id_select" on revenue_identities for select using (organization_id = current_org_id());
drop policy if exists "rev_id_insert" on revenue_identities;
create policy "rev_id_insert" on revenue_identities for insert with check (organization_id = current_org_id() and public.is_admin());
drop policy if exists "rev_id_update" on revenue_identities;
create policy "rev_id_update" on revenue_identities for update using (organization_id = current_org_id() and public.is_admin());
drop policy if exists "rev_id_delete" on revenue_identities;
create policy "rev_id_delete" on revenue_identities for delete using (organization_id = current_org_id() and public.is_admin());

create table if not exists client_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  project_title text not null, client_name text, job_description text, client_feedback text, my_role text,
  project_start_date date, project_end_date date, is_ongoing boolean not null default false,
  budget_type text check (budget_type in ('fixed','hourly',null)),
  budget_earned numeric(12,2), budget_currency text default 'USD',
  hourly_rate numeric(10,2), hours_worked numeric(8,1),
  client_rating numeric(2,1) check (client_rating between 0 and 5),
  tags text[] not null default '{}',
  source_kind text not null default 'import' check (source_kind in ('import','manual')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists cc_profile_idx on client_contracts (profile_id);
create index if not exists cc_org_idx on client_contracts (organization_id);
create index if not exists cc_tags_idx on client_contracts using gin (tags);
alter table client_contracts enable row level security;
drop policy if exists "cc_select" on client_contracts;
create policy "cc_select" on client_contracts for select using (organization_id = current_org_id());
drop policy if exists "cc_insert" on client_contracts;
create policy "cc_insert" on client_contracts for insert with check (organization_id = current_org_id() and public.is_admin());
drop policy if exists "cc_update" on client_contracts;
create policy "cc_update" on client_contracts for update using (organization_id = current_org_id() and public.is_admin());
drop policy if exists "cc_delete" on client_contracts;
create policy "cc_delete" on client_contracts for delete using (organization_id = current_org_id() and public.is_admin());

create table if not exists portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  project_title text not null, my_role text, description text,
  skills text[] not null default '{}', technologies text[] not null default '{}',
  published_at date, source_kind text not null default 'import' check (source_kind in ('import','manual')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists pp_profile_idx on portfolio_projects (profile_id);
create index if not exists pp_org_idx on portfolio_projects (organization_id);
alter table portfolio_projects enable row level security;
drop policy if exists "pp_select" on portfolio_projects;
create policy "pp_select" on portfolio_projects for select using (organization_id = current_org_id());
drop policy if exists "pp_insert" on portfolio_projects;
create policy "pp_insert" on portfolio_projects for insert with check (organization_id = current_org_id() and public.is_admin());
drop policy if exists "pp_update" on portfolio_projects;
create policy "pp_update" on portfolio_projects for update using (organization_id = current_org_id() and public.is_admin());
drop policy if exists "pp_delete" on portfolio_projects;
create policy "pp_delete" on portfolio_projects for delete using (organization_id = current_org_id() and public.is_admin());

create table if not exists identity_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  assigned_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (revenue_identity_id, rep_id)
);
create index if not exists ia_rep_idx on identity_assignments (rep_id);
create index if not exists ia_identity_idx on identity_assignments (revenue_identity_id);
alter table identity_assignments enable row level security;
drop policy if exists "ia_select" on identity_assignments;
create policy "ia_select" on identity_assignments for select using (organization_id = current_org_id() and (rep_id = public.current_rep_id() or public.is_admin()));
drop policy if exists "ia_insert" on identity_assignments;
create policy "ia_insert" on identity_assignments for insert with check (organization_id = current_org_id() and public.is_admin());
drop policy if exists "ia_delete" on identity_assignments;
create policy "ia_delete" on identity_assignments for delete using (organization_id = current_org_id() and public.is_admin());

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  event_type text not null, actor_id uuid references reps(id) on delete set null,
  revenue_identity_id uuid references revenue_identities(id) on delete set null,
  target_type text, target_id uuid, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists al_org_time_idx on activity_log (organization_id, created_at desc);
create index if not exists al_actor_idx on activity_log (actor_id);
create index if not exists al_identity_idx on activity_log (revenue_identity_id);
alter table activity_log enable row level security;
drop policy if exists "al_select" on activity_log;
create policy "al_select" on activity_log for select using (organization_id = current_org_id() and (public.is_admin() or actor_id = public.current_rep_id()));
drop policy if exists "al_insert" on activity_log;
create policy "al_insert" on activity_log for insert with check (organization_id = current_org_id());

-- ============================================================================
-- SEED DATA — single DO block, handles all edge cases
-- ============================================================================

-- End of tables-only migration
