-- Scout (working codename: Relay). Initial schema.
-- Apply with: supabase db reset   (local) or push to the Supabase project.

create extension if not exists pgcrypto;

-- ============================================================================
-- Tables
-- ============================================================================

create table reps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('rep', 'sourcer', 'admin')),
  -- Links a rep row to a Supabase auth user so RLS can resolve auth.uid().
  -- Admin creates reps; the auth user signs in with email + password.
  auth_user_id uuid unique references auth.users(id),
  created_at timestamptz default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  owner_rep_id uuid references reps(id),
  company text not null,
  company_key text generated always as (lower(regexp_replace(company, '[^a-z0-9]', '', 'gi'))) stored,
  contact_name text,
  contact_title text,
  url text,
  raw_input text,
  signal_type int check (signal_type between 1 and 7),
  signal_evidence text,
  verbatim_quote text,
  score int check (score between 0 and 12),
  verdict text check (verdict in ('send', 'research_more', 'skip')),
  status text default 'new' check (status in ('new', 'contacted', 'followed_up', 'replied', 'no', 'dead')),
  created_at timestamptz default now()
);

-- Dedupe backstop: the same live company can only ever appear once.
create unique index leads_company_key_unique on leads (company_key) where status != 'dead';
create index leads_owner_idx on leads (owner_rep_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) not null,
  rep_id uuid references reps(id),
  type text not null check (type in ('dm', 'connection', 'upwork', 'followup', 'reply')),
  draft_text text,
  sent_text text,
  sent_at timestamptz,
  model_used text,
  created_at timestamptz default now()
);

create index messages_lead_idx on messages (lead_id);
create index messages_rep_sent_idx on messages (rep_id, sent_at);

create table outcomes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) not null,
  stage text not null check (stage in ('replied', 'read', 'check', 'slice', 'close', 'standing')),
  occurred_at timestamptz default now()
);

create index outcomes_lead_idx on outcomes (lead_id);

create table voice_profiles (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid references reps(id) unique,
  style_card jsonb not null,
  sample_source text not null check (sample_source in ('quiz', 'pasted_samples', 'both')),
  calibrated_at timestamptz default now()
);

create table facts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  value text not null,
  fact_type text,
  added_by uuid references reps(id),
  created_at timestamptz default now()
);

-- Play templates matched to a signal. Placeholder library for now.
create table plays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  situation text not null,
  template_shape text not null
);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table reps enable row level security;
alter table leads enable row level security;
alter table messages enable row level security;
alter table outcomes enable row level security;
alter table voice_profiles enable row level security;
alter table facts enable row level security;
alter table plays enable row level security;

-- Ad-hoc helpers used by the policies below.
create or replace function public.current_rep_id() returns uuid
language sql stable security definer set search_path = public as
$$
  select r.id from reps r where r.auth_user_id = auth.uid();
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$
  select coalesce((select r.role from reps r where r.auth_user_id = auth.uid()) = 'admin', false);
$$;

-- reps: everyone signed-in can read names/roles for the team view.
create policy reps_select on reps for select
  to authenticated using (auth.role() = 'authenticated');
create policy reps_admin_write on reps for insert
  to authenticated with check (public.is_admin());
create policy reps_admin_update on reps for update
  to authenticated using (public.is_admin()) with check (public.is_admin());
create policy reps_admin_delete on reps for delete
  to authenticated using (public.is_admin());

-- leads: owner or admin can see and update; a rep/sourcer/admin can create.
create policy leads_select on leads for select
  to authenticated using (owner_rep_id = public.current_rep_id() or public.is_admin());
create policy leads_insert on leads for insert
  to authenticated with check (owner_rep_id = public.current_rep_id());
create policy leads_update on leads for update
  to authenticated using (owner_rep_id = public.current_rep_id() or public.is_admin());
create policy leads_delete on leads for delete
  to authenticated using (public.is_admin());

-- messages: via owning lead or admin.
create policy messages_select on messages for select
  to authenticated using (
    exists (select 1 from leads l where l.id = lead_id and (l.owner_rep_id = public.current_rep_id() or public.is_admin()))
    or public.is_admin()
  );
create policy messages_insert on messages for insert
  to authenticated with check (
    exists (select 1 from leads l where l.id = lead_id and (l.owner_rep_id = public.current_rep_id() or public.is_admin()))
    or public.is_admin()
  );
create policy messages_admin_update on messages for update
  to authenticated using (public.is_admin());
create policy messages_admin_delete on messages for delete
  to authenticated using (public.is_admin());

-- outcomes: via owning lead or admin.
create policy outcomes_select on outcomes for select
  to authenticated using (
    exists (select 1 from leads l where l.id = lead_id and (l.owner_rep_id = public.current_rep_id() or public.is_admin()))
    or public.is_admin()
  );
create policy outcomes_insert on outcomes for insert
  to authenticated with check (
    exists (select 1 from leads l where l.id = lead_id and (l.owner_rep_id = public.current_rep_id() or public.is_admin()))
    or public.is_admin()
  );
create policy outcomes_admin_delete on outcomes for delete
  to authenticated using (public.is_admin());

-- voice profiles: own or admin (read/write). No one else's style card is exposed.
create policy vp_select on voice_profiles for select
  to authenticated using (rep_id = public.current_rep_id() or public.is_admin());
create policy vp_insert on voice_profiles for insert
  to authenticated with check (rep_id = public.current_rep_id() or public.is_admin());
create policy vp_update on voice_profiles for update
  to authenticated using (rep_id = public.current_rep_id() or public.is_admin());
create policy vp_delete on voice_profiles for delete
  to authenticated using (public.is_admin());

-- facts: read for every signed-in rep, write admin only.
create policy facts_select on facts for select
  to authenticated using (auth.role() = 'authenticated');
create policy facts_admin_insert on facts for insert
  to authenticated with check (public.is_admin());
create policy facts_admin_update on facts for update
  to authenticated using (public.is_admin());
create policy facts_admin_delete on facts for delete
  to authenticated using (public.is_admin());

-- plays: read for every signed-in rep, write admin only.
create policy plays_select on plays for select
  to authenticated using (auth.role() = 'authenticated');
create policy plays_admin_insert on plays for insert
  to authenticated with check (public.is_admin());
create policy plays_admin_update on plays for update
  to authenticated using (public.is_admin());
create policy plays_admin_delete on plays for delete
  to authenticated using (public.is_admin());

-- ============================================================================
-- Seed: obviously fake placeholder data. Replace before any real use.
-- ============================================================================

-- Dev auth users (email + password auth). Passwords are DEV ONLY.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'hassan@scout.dev',
  extensions.crypt('scout-dev-password', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
where not exists (select 1 from auth.users where email = 'hassan@scout.dev');

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 'ahmed@scout.dev',
  extensions.crypt('scout-dev-password', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
where not exists (select 1 from auth.users where email = 'ahmed@scout.dev');

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'authenticated', 'authenticated', 'nadia@scout.dev',
  extensions.crypt('scout-dev-password', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
where not exists (select 1 from auth.users where email = 'nadia@scout.dev');

-- Auth identities for the dev users. Modern GoTrue requires one per user for
-- email/password sign-in to work.
insert into auth.identities
  (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select
  'aaaaaaaa-0000-0000-0000-000000000101', u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', u.id::text, now(), now(), now()
from auth.users u
where u.email = 'hassan@scout.dev'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

insert into auth.identities
  (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select
  'aaaaaaaa-0000-0000-0000-000000000102', u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', u.id::text, now(), now(), now()
from auth.users u
where u.email = 'ahmed@scout.dev'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

insert into auth.identities
  (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select
  'aaaaaaaa-0000-0000-0000-000000000103', u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', u.id::text, now(), now(), now()
from auth.users u
where u.email = 'nadia@scout.dev'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- Reps (linked to the dev auth users above). FAKE names.
insert into reps (id, name, role, auth_user_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Hassan (demo)', 'admin', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Ahmed (demo)', 'rep', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'Nadia (demo)', 'rep', 'aaaaaaaa-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- Voice profiles: Ahmed and Nadia calibrated; Hassan intentionally NOT, so
-- first login walks the onboarding flow.
insert into voice_profiles (id, rep_id, style_card, sample_source, calibrated_at) values
  (
    'cccccccc-0000-0000-0000-000000000002',
    'bbbbbbbb-0000-0000-0000-000000000002',
    '{"contractions":"mostly_no","formality":3,"sentence_length":"short","punctuation":"standard","openers":"statement","emoji_use":"none","greeting":"Hi","sign_off":"Best regards","never_words":["leverage","synergy","circle back"],"preferred_words":["fit","ship","plan"],"summary":"Short, direct, formal messages with no contractions and a classic sign-off."}'::jsonb,
    'pasted_samples',
    now() - interval '30 days'
  ),
  (
    'cccccccc-0000-0000-0000-000000000003',
    'bbbbbbbb-0000-0000-0000-000000000003',
    '{"contractions":"mostly_yes","formality":2,"sentence_length":"medium","punctuation":"relaxed","openers":"question","emoji_use":"none","greeting":"Hey","sign_off":"Cheers","never_words":["dear","kindly","regards"],"preferred_words":[],"summary":"Friendly, casual, quick questions, keeps it light and personal."}'::jsonb,
    'quiz',
    now() - interval '20 days'
  )
on conflict (rep_id) do nothing;

-- Facts: FAKE values, clearly marked. Replace before real use.
insert into facts (id, label, value, fact_type, added_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'Years shipping (FAKE)', '8 years', 'credential', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000002', 'Typical senior project (FAKE)', '$14k per month', 'price', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000003', 'Reliable rewrites (FAKE)', 'ship a reboot without a rewrite', 'credential', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000004', 'AI products shipped (FAKE)', '40+ products', 'case', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000005', 'Review pace (FAKE)', 'first plan in 10 days', 'process', 'bbbbbbbb-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- Plays: placeholder templates.
insert into plays (id, name, situation, template_shape) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'Play: rescue the backlog (FAKE)', 'asking',
   'Addresses the specific bottleneck they mentioned, offers one concrete next step, keeps it to 3 sentences.'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'Play: hiring ramp (FAKE)', 'hiring',
   'Notices the hiring signal, names the capacity gap, asks if a delivery partner would let them keep hiring on the roadmap.'),
  ('eeeeeeee-0000-0000-0000-000000000003', 'Play: budget anchor (FAKE)', 'funding',
   'Congratulates briefly, then gives a clear, budget-relevant fact and a low-friction next step.')
on conflict (id) do nothing;

-- Leads + messages + outcomes: FAKE demo pipeline so the dashboards render.
insert into leads (id, owner_rep_id, company, contact_name, contact_title, url, raw_input,
                   signal_type, signal_evidence, verbatim_quote, score, verdict, status, created_at) values
  (
    'ffffffff-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
    'Acme Nail Polish Co', 'Priya Sharma', 'Founder', 'https://example.com/acme',
    'FAKE demo lead. Priya Sharma, founder of Acme Nail Polish Co. Posted on LinkedIn: "We are drowning in a backlog and honestly open to a partner who can take the mobile app over." Last release was 14 months ago.',
    7, 'Founder posted publicly that the team is drowning in backlog and is open to a partner taking over the mobile app; last release 14 months ago.',
    'We are honestly open to a partner who can take the mobile app over', 11, 'send', 'contacted', now() - interval '6 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001',
    'Beacon Hotel Booking', 'Leo Fontaine', 'CTO', 'https://example.com/beacon',
    'FAKE demo lead. Beacon Hotel Booking lists 4 open engineering roles and 2 product roles. CTO Leo Fontaine.',
    1, 'Four open engineering roles and two product roles listed in the last month.',
    null, 10, 'send', 'new', now() - interval '1 day'
  ),
  (
    'ffffffff-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002',
    'Cedar Tree Software', 'Maya Osei', 'Head of Product', 'https://example.com/cedar',
    'FAKE demo lead. App store reviews complain the latest fix took six months. Head of Product Maya Osei.',
    6, 'Multiple recent reviews mention a simple bug reportedly taking six months to ship.',
    'Six months for a one-line fix', 8, 'research_more', 'contacted', now() - interval '4 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001',
    'Delta Bakery App', 'Marco Ruiz', 'Owner', 'https://example.com/delta',
    'FAKE demo lead. No updates in 2 years, low ratings. Owner Marco Ruiz said not interested in May.',
    4, 'App store listing last updated over two years ago, reviews ask for basic features.',
    null, 5, 'skip', 'no', now() - interval '30 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000003',
    'Everest Fitness Wear', 'Anna Kowalski', 'CEO', 'https://example.com/everest',
    'FAKE demo lead. Everest Fitness Wear closed a seed round and is expanding to Europe.',
    3, 'Closed a seed round and announced plans to expand to new markets.',
    null, 9, 'research_more', 'contacted', now() - interval '9 days'
  )
on conflict (id) do nothing;

insert into messages (id, lead_id, rep_id, type, sent_text, sent_at, model_used, created_at) values
  ('99999999-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   'dm', 'Hey Priya, saw your post about the backlog. We help teams like yours take a product off their shoulders. Want a quick read on your mobile app? Best.',
   now() - interval '6 days', 'demo-seed', now() - interval '6 days'),
  ('99999999-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002',
   'dm', 'Hi Maya, the review about the six month wait caught my eye. We ship faster than that for teams your size. Worth 15 minutes? Best regards.',
   now() - interval '4 days', 'demo-seed', now() - interval '4 days'),
  ('99999999-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000003',
   'dm', 'Hey Anna, congrats on the round. When teams expand markets that fast, the app usually needs to keep up. Want to talk through it? Cheers.',
   now() - interval '9 days', 'demo-seed', now() - interval '9 days')
on conflict (id) do nothing;

insert into outcomes (id, lead_id, stage, occurred_at) values
  ('88888888-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'read', now() - interval '5 days'),
  ('88888888-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000001', 'check', now() - interval '4 days'),
  ('88888888-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000001', 'replied', now() - interval '4 days'),
  ('88888888-0000-0000-0000-000000000004', 'ffffffff-0000-0000-0000-000000000003', 'read', now() - interval '3 days'),
  ('88888888-0000-0000-0000-000000000005', 'ffffffff-0000-0000-0000-000000000005', 'replied', now() - interval '7 days')
on conflict (id) do nothing;