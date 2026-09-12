-- 0018: Personal content engine.
--
-- Business rule: a content persona is a person (rep) configured with a set of
-- pillars (topics they want to be known for) and a voice card. Drafts are
-- generated from real material the person provides — never invented. History
-- tracks what has been posted to prevent repetition.
--
-- Decoupled by design: nothing here references leads, proof_items, or any
-- other bpulse-specific table. A persona is just a person with pillars and a
-- voice, full stop. This module could be extracted into its own product
-- without a rewrite.

-- ── Personas ──────────────────────────────────────────────────────────────
create table if not exists content_personas (
  id          uuid primary key default gen_random_uuid(),
  rep_id      uuid not null references reps(id) on delete cascade,
  display_name text not null,
  platforms   text[] not null default '{}',
  voice_profile_id uuid references voice_profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_content_personas_rep
  on content_personas(rep_id);

alter table content_personas enable row level security;

drop policy if exists "content_personas_owner" on content_personas;
create policy "content_personas_owner" on content_personas
  for all using (
    rep_id = auth.uid()
    or auth.uid() in (select id from reps where role = 'admin')
  );

-- ── Pillars ───────────────────────────────────────────────────────────────
create table if not exists content_pillars (
  id          uuid primary key default gen_random_uuid(),
  persona_id  uuid not null references content_personas(id) on delete cascade,
  pillar_name text not null,
  description text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists idx_content_pillars_persona
  on content_pillars(persona_id);

alter table content_pillars enable row level security;

drop policy if exists "content_pillars_persona_owner" on content_pillars;
create policy "content_pillars_persona_owner" on content_pillars
  for all using (
    persona_id in (select id from content_personas where rep_id = auth.uid())
    or auth.uid() in (select id from reps where role = 'admin')
  );

-- ── Drafts ────────────────────────────────────────────────────────────────
create table if not exists content_drafts (
  id              uuid primary key default gen_random_uuid(),
  persona_id      uuid not null references content_personas(id) on delete cascade,
  pillar_id       uuid references content_pillars(id) on delete set null,
  source_material text not null,
  platform        text not null check (platform in ('linkedin', 'x')),
  caption         text not null default '',
  hook_score      integer check (hook_score between 1 and 10),
  hook_feedback   text not null default '',
  self_check_passed boolean not null default false,
  self_check_note text not null default '',
  status          text not null default 'draft'
                    check (status in ('draft', 'ready', 'posted', 'rejected')),
  created_at      timestamptz not null default now()
);

create index if not exists idx_content_drafts_persona
  on content_drafts(persona_id);
create index if not exists idx_content_drafts_status
  on content_drafts(status);

alter table content_drafts enable row level security;

drop policy if exists "content_drafts_persona_owner" on content_drafts;
create policy "content_drafts_persona_owner" on content_drafts
  for all using (
    persona_id in (select id from content_personas where rep_id = auth.uid())
    or auth.uid() in (select id from reps where role = 'admin')
  );

-- ── History ───────────────────────────────────────────────────────────────
create table if not exists content_history (
  id              uuid primary key default gen_random_uuid(),
  persona_id      uuid not null references content_personas(id) on delete cascade,
  pillar_id       uuid references content_pillars(id) on delete set null,
  platform        text not null,
  opening_line    text not null,
  posted_at       timestamptz not null default now()
);

create index if not exists idx_content_history_persona
  on content_history(persona_id);
create index if not exists idx_content_history_persona_posted
  on content_history(persona_id, posted_at desc);

alter table content_history enable row level security;

drop policy if exists "content_history_persona_owner" on content_history;
create policy "content_history_persona_owner" on content_history
  for all using (
    persona_id in (select id from content_personas where rep_id = auth.uid())
    or auth.uid() in (select id from reps where role = 'admin')
  );
