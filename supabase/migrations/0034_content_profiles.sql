-- 0034: Content DNA — persistent evolving profile for each content persona.
--
-- A content_profile stores structured and semi-structured understanding of who
-- this person is professionally: what they know, what they've done, what they
-- believe, how they write. Built progressively — every interaction can add
-- candidate memories. Nothing here is invented by the system without evidence.

create table if not exists content_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  persona_id uuid not null references content_personas(id) on delete cascade,

  -- Structured, queriable fields
  role text not null default '',
  seniority text not null default '',
  industries text[] not null default '{}',
  audience text not null default '',

  -- Flexible evolving data (JSONB for model-generated structures)
  expertise jsonb not null default '[]',
  technologies jsonb not null default '[]',
  goals jsonb not null default '[]',
  topics_cared jsonb not null default '[]',
  topics_avoided jsonb not null default '[]',
  opinions jsonb not null default '[]',
  projects jsonb not null default '[]',
  experiences jsonb not null default '[]',
  writing_characteristics jsonb not null default '{}',
  storytelling_tendencies jsonb not null default '[]',

  -- Metadata
  confidence double precision not null default 0 check (confidence between 0 and 1),
  last_learned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists content_profiles_persona_idx
  on content_profiles(persona_id);
create index if not exists content_profiles_org_idx
  on content_profiles(organization_id);

alter table content_profiles enable row level security;

drop policy if exists "content_profiles_owner" on content_profiles;
create policy "content_profiles_owner" on content_profiles
  for all using (
    organization_id = current_org_id()
  );

-- Link personas to their content profile
do $$ begin
  if to_regclass('public.content_personas') is not null then
    alter table content_personas add column if not exists content_profile_id uuid references content_profiles(id) on delete set null;
    create index if not exists content_personas_profile_idx on content_personas(content_profile_id);
  end if;
end $$;
