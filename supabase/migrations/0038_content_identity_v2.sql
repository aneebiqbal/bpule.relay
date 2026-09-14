-- Content Identity v2 — unified persona intelligence + journey + quick capture
-- Extends existing tables without breaking current functionality.

-- Extend content_personas with identity tracking
alter table content_personas
  add column if not exists persona_role text default '',
  add column if not exists persona_company text default '',
  add column if not exists persona_location text default '',
  add column if not exists content_comfort text[] default '{}',
  add column if not exists onboarding_step text default 'identity',
  add column if not exists onboarding_completed boolean default false,
  add column if not exists onboarding_data jsonb default '{}'::jsonb;

-- Extend content_profiles with source tracking + content identity
alter table content_profiles
  add column if not exists sources jsonb default '[]'::jsonb,
  add column if not exists audiences text[] default '{}',
  add column if not exists territories text[] default '{}',
  add column if not exists voice_samples jsonb default '[]'::jsonb,
  add column if not exists voice_selection text default '',
  add column if not exists content_goals text[] default '{}';

-- Journey — living professional timeline
create table if not exists content_journey (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  persona_id uuid not null references content_personas(id) on delete cascade,
  event_type text not null, -- 'joined', 'shipped', 'learned', 'posted', 'milestone', 'project', 'role_change', 'other'
  title text not null,
  description text default '',
  event_date timestamptz,
  source text default 'user_entry', -- 'user_entry', 'imported', 'ai_inferred', 'confirmed'
  created_at timestamptz not null default now()
);

create index if not exists idx_content_journey_persona on content_journey(persona_id, created_at desc);

-- Quick Capture — messy input → angles
create table if not exists content_quick_captures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  persona_id uuid not null references content_personas(id) on delete cascade,
  raw_input text not null,
  suggested_angles jsonb default '[]'::jsonb,
  status text default 'pending', -- 'pending', 'used', 'dismissed'
  created_at timestamptz not null default now()
);

create index if not exists idx_quick_captures_persona on content_quick_captures(persona_id, created_at desc);

-- RLS
alter table content_journey enable row level security;
alter table content_quick_captures enable row level security;

drop policy if exists "content_journey_owner_select" on content_journey;
create policy "content_journey_owner_select" on content_journey for select using (
  organization_id = current_org_id()
);

drop policy if exists "content_journey_owner_insert" on content_journey;
create policy "content_journey_owner_insert" on content_journey for insert with check (
  organization_id = current_org_id()
);

drop policy if exists "content_journey_owner_update" on content_journey;
create policy "content_journey_owner_update" on content_journey for update using (
  organization_id = current_org_id()
);

drop policy if exists "content_journey_owner_delete" on content_journey;
create policy "content_journey_owner_delete" on content_journey for delete using (
  organization_id = current_org_id()
);

drop policy if exists "content_quick_captures_owner_select" on content_quick_captures;
create policy "content_quick_captures_owner_select" on content_quick_captures for select using (
  organization_id = current_org_id()
);

drop policy if exists "content_quick_captures_owner_insert" on content_quick_captures;
create policy "content_quick_captures_owner_insert" on content_quick_captures for insert with check (
  organization_id = current_org_id()
);

drop policy if exists "content_quick_captures_owner_update" on content_quick_captures;
create policy "content_quick_captures_owner_update" on content_quick_captures for update using (
  organization_id = current_org_id()
);

drop policy if exists "content_quick_captures_owner_delete" on content_quick_captures;
create policy "content_quick_captures_owner_delete" on content_quick_captures for delete using (
  organization_id = current_org_id()
);

-- Refresh schema cache
notify pgrst, 'reload schema';
