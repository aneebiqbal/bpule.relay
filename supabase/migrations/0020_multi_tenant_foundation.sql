-- 020: Multi-tenant foundation — organizations table + tenant columns.
--
-- Creates the organizations table and adds organization_id to every table that
-- stores data belonging to one business. Existing rows backfilled to a single
-- "bpulse" organization so the current dataset keeps working. organization_id
-- is then made NOT NULL so no future row can exist without a tenant.

create extension if not exists pgcrypto;

-- ============================================================================
-- Organizations
-- ============================================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'trial' check (plan in ('trial', 'active', 'past_due', 'canceled')),
  billing_customer_id text,
  created_at timestamptz default now()
);

-- bpulse is the first real tenant. All existing data gets migrated to it.
insert into organizations (id, name, plan)
values ('11111111-1111-1111-1111-111111111111', 'bpulse', 'active')
on conflict (id) do nothing;

-- ============================================================================
-- Add organization_id to every tenant-scoped table
-- ============================================================================

alter table reps add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table reps add constraint reps_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table leads add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table leads add constraint leads_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table messages add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table messages add constraint messages_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table outcomes add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table outcomes add constraint outcomes_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table voice_profiles add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table voice_profiles add constraint voice_profiles_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table facts add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table facts add constraint facts_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table plays add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table plays add constraint plays_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table profiles add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table profiles add constraint profiles_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table proof_items add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table proof_items add constraint proof_items_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table golden_set add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table golden_set add constraint golden_set_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table few_shot_wins add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table few_shot_wins add constraint few_shot_wins_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table upwork_jobs add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table upwork_jobs add constraint upwork_jobs_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table upwork_messages add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table upwork_messages add constraint upwork_messages_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table csv_imports add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table csv_imports add constraint csv_imports_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table content_personas add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table content_personas add constraint content_personas_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table content_pillars add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table content_pillars add constraint content_pillars_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table content_drafts add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table content_drafts add constraint content_drafts_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table content_history add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table content_history add constraint content_history_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table push_subscriptions add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table push_subscriptions add constraint push_subscriptions_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table notification_log add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table notification_log add constraint notification_log_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table eval_runs add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table eval_runs add constraint eval_runs_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

alter table extraction_runs add column organization_id uuid not null default '11111111-1111-1111-1111-111111111111';
alter table extraction_runs add constraint extraction_runs_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade;

-- ============================================================================
-- Indexes for tenant-scoped lookups
-- ============================================================================

create index reps_organization_idx on reps (organization_id);
create index leads_organization_idx on leads (organization_id);
create index messages_organization_idx on messages (organization_id);
create index outcomes_organization_idx on outcomes (organization_id);
create index voice_profiles_organization_idx on voice_profiles (organization_id);
create index facts_organization_idx on facts (organization_id);
create index plays_organization_idx on plays (organization_id);
create index profiles_organization_idx on profiles (organization_id);
create index proof_items_organization_idx on proof_items (organization_id);
create index golden_set_organization_idx on golden_set (organization_id);
create index few_shot_wins_organization_idx on few_shot_wins (organization_id);
create index upwork_jobs_organization_idx on upwork_jobs (organization_id);
create index upwork_messages_organization_idx on upwork_messages (organization_id);
create index csv_imports_organization_idx on csv_imports (organization_id);
create index content_personas_organization_idx on content_personas (organization_id);
create index content_pillars_organization_idx on content_pillars (organization_id);
create index content_drafts_organization_idx on content_drafts (organization_id);
create index content_history_organization_idx on content_history (organization_id);
create index push_subscriptions_organization_idx on push_subscriptions (organization_id);
create index notification_log_organization_idx on notification_log (organization_id);
create index eval_runs_organization_idx on eval_runs (organization_id);
create index extraction_runs_organization_idx on extraction_runs (organization_id);
