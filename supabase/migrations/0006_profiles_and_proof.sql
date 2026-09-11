-- Phase 3 schema: multi-profile identity, proof items, lead tags, RLS, storage.

-- ============================================================================
-- Profiles: one rep can have multiple platform identities (LinkedIn, Upwork).
-- ============================================================================

create table profiles (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid references reps(id) not null,
  platform text not null check (platform in ('linkedin', 'upwork')),
  label text,
  profile_url text,
  headline text,
  cv_path text,
  created_at timestamptz default now()
);

create index profiles_rep_idx on profiles (rep_id);

-- RLS: owner or admin.
alter table profiles enable row level security;

create policy profiles_select on profiles for select
  to authenticated using (rep_id = public.current_rep_id() or public.is_admin());
create policy profiles_insert on profiles for insert
  to authenticated with check (rep_id = public.current_rep_id());
create policy profiles_update on profiles for update
  to authenticated using (rep_id = public.current_rep_id() or public.is_admin());
create policy profiles_delete on profiles for delete
  to authenticated using (rep_id = public.current_rep_id() or public.is_admin());

-- ============================================================================
-- Proof items: structured past-project evidence attached to a profile.
-- ============================================================================

create table proof_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade not null,
  client_named boolean default false,
  client_name text,
  permission_on_file boolean default false,
  project_summary text not null,
  review_quote text,
  tags text[] default '{}',
  created_at timestamptz default now()
);

create index proof_items_profile_idx on proof_items (profile_id);

-- RLS: follow the owning profile's rep.
alter table proof_items enable row level security;

create policy proof_items_select on proof_items for select
  to authenticated using (
    exists (select 1 from profiles p where p.id = proof_items.profile_id and (p.rep_id = public.current_rep_id() or public.is_admin()))
  );
create policy proof_items_insert on proof_items for insert
  to authenticated with check (
    exists (select 1 from profiles p where p.id = profile_id and p.rep_id = public.current_rep_id())
  );
create policy proof_items_update on proof_items for update
  to authenticated using (
    exists (select 1 from profiles p where p.id = proof_items.profile_id and (p.rep_id = public.current_rep_id() or public.is_admin()))
  );
create policy proof_items_delete on proof_items for delete
  to authenticated using (
    exists (select 1 from profiles p where p.id = proof_items.profile_id and (p.rep_id = public.current_rep_id() or public.is_admin()))
  );

-- ============================================================================
-- Lead tags: extracted at extraction time for proof matching.
-- ============================================================================

alter table leads add column tags text[] default '{}';
create index leads_tags_idx on leads using gin (tags);

-- ============================================================================
-- Storage bucket + policies are created via supabase scripts/ensure-storage.mjs
-- because storage.objects is owned by storage_admin, not the migration role.
-- ============================================================================

-- ============================================================================
-- Fact flag: site_live (controls CTA enforcement in drafting).
-- ============================================================================

insert into facts (label, value, fact_type, added_by)
select 'Site live', 'false', 'config', (select id from reps where role = 'admin' limit 1)
where not exists (select 1 from facts where label = 'Site live');
