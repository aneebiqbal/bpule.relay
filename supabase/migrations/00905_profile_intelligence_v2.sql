-- 0090: Profile Intelligence V2 — Agentic Profile Ingestion
--
-- Evolves the existing profiles table with intelligence fields,
-- adds import batch tracking, source file tracking, and reviews.
-- Fully idempotent.

-- ============================================================================
-- PROFILES: Add intelligence fields
-- ============================================================================

alter table profiles add column if not exists full_name text;
alter table profiles add column if not exists display_name text;
alter table profiles add column if not exists "current_role" text;
alter table profiles add column if not exists company text;
alter table profiles add column if not exists location text;
alter table profiles add column if not exists bio text;
alter table profiles add column if not exists professional_summary text;
alter table profiles add column if not exists seniority text check (seniority in ('junior', 'mid', 'senior', 'lead', 'principal', 'executive', null));
alter table profiles add column if not exists years_experience numeric(4,1);
alter table profiles add column if not exists primary_skills jsonb not null default '[]'::jsonb;
alter table profiles add column if not exists secondary_skills jsonb not null default '[]'::jsonb;
alter table profiles add column if not exists technologies jsonb not null default '[]'::jsonb;
alter table profiles add column if not exists industries jsonb not null default '[]'::jsonb;
alter table profiles add column if not exists service_capabilities jsonb not null default '[]'::jsonb;
alter table profiles add column if not exists specialties jsonb not null default '[]'::jsonb;
alter table profiles add column if not exists positioning text;
alter table profiles add column if not exists preferred_engagement_types jsonb not null default '[]'::jsonb;
alter table profiles add column if not exists audience_client_fit jsonb not null default '[]'::jsonb;
alter table profiles add column if not exists differentiators jsonb not null default '[]'::jsonb;
alter table profiles add column if not exists communication_style jsonb not null default '{}'::jsonb;
alter table profiles add column if not exists languages jsonb not null default '[]'::jsonb;
alter table profiles add column if not exists profile_confidence numeric(3,2) check (profile_confidence between 0 and 1);
alter table profiles add column if not exists extraction_version text not null default 'v2';
alter table profiles add column if not exists readiness text not null default 'needs_source' check (readiness in ('ready', 'needs_source', 'needs_review', 'incomplete'));
alter table profiles add column if not exists ai_context jsonb not null default '{}'::jsonb;
alter table profiles add column if not exists archived_at timestamptz;
alter table profiles add column if not exists source_count int not null default 0;
alter table profiles add column if not exists proof_count int not null default 0;

create index if not exists profiles_readiness_idx on profiles (organization_id, readiness) where archived_at is null;
create index if not exists profiles_archived_idx on profiles (organization_id, archived_at);

-- ============================================================================
-- PROFILE IMPORT BATCHES
-- ============================================================================

create table if not exists profile_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  uploaded_by uuid not null references reps(id) on delete cascade,
  status text not null default 'uploaded'
    check (status in ('uploaded','parsing','identifying_people','extracting','matching','synthesizing','review_required','ready','partial_failure','failed')),
  total_files int not null default 0,
  processed_files int not null default 0,
  failed_files int not null default 0,
  detected_people int not null default 0,
  created_profiles int not null default 0,
  merged_profiles int not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists import_batches_org_idx on profile_import_batches (organization_id, created_at desc);
create index if not exists import_batches_status_idx on profile_import_batches (organization_id, status);

alter table profile_import_batches enable row level security;
drop policy if exists "import_batches_select" on profile_import_batches;
create policy "import_batches_select" on profile_import_batches for select using (organization_id = current_org_id());
drop policy if exists "import_batches_insert" on profile_import_batches;
create policy "import_batches_insert" on profile_import_batches for insert with check (organization_id = current_org_id());
drop policy if exists "import_batches_update" on profile_import_batches;
create policy "import_batches_update" on profile_import_batches for update using (organization_id = current_org_id());

-- ============================================================================
-- PROFILE SOURCES (uploaded files)
-- ============================================================================

create table if not exists profile_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  import_batch_id uuid references profile_import_batches(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes int not null,
  file_hash text not null,
  parsing_status text not null default 'pending' check (parsing_status in ('pending','parsing','parsed','ocr_required','failed','unsupported')),
  extraction_status text not null default 'pending' check (extraction_status in ('pending','extracting','extracted','partial_failure','failed')),
  parsed_content text,
  page_count int,
  detected_people jsonb not null default '[]'::jsonb,
  error_message text,
  uploaded_by uuid not null references reps(id) on delete cascade,
  uploaded_at timestamptz not null default now(),
  parsed_at timestamptz,
  extracted_at timestamptz
);

create index if not exists sources_org_idx on profile_sources (organization_id);
create index if not exists sources_profile_idx on profile_sources (profile_id);
create index if not exists sources_batch_idx on profile_sources (import_batch_id);
create index if not exists sources_hash_idx on profile_sources (organization_id, file_hash);

alter table profile_sources enable row level security;
drop policy if exists "sources_select" on profile_sources;
create policy "sources_select" on profile_sources for select using (organization_id = current_org_id());
drop policy if exists "sources_insert" on profile_sources;
create policy "sources_insert" on profile_sources for insert with check (organization_id = current_org_id());
drop policy if exists "sources_update" on profile_sources;
create policy "sources_update" on profile_sources for update using (organization_id = current_org_id());
drop policy if exists "sources_delete" on profile_sources;
create policy "sources_delete" on profile_sources for delete using (organization_id = current_org_id() and public.is_admin());

-- ============================================================================
-- PROFILE REVIEWS (testimonials from source documents)
-- ============================================================================

create table if not exists profile_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  source_id uuid references profile_sources(id) on delete set null,
  review_text text not null,
  reviewer_name text,
  reviewer_role text,
  reviewer_company text,
  project_context text,
  relevant_skills jsonb not null default '[]'::jsonb,
  evidence_type text not null default 'explicit_claim'
    check (evidence_type in ('fact','explicit_claim','strong_inference','weak_inference','unknown')),
  confidence numeric(3,2) check (confidence between 0 and 1),
  safe_for_outreach boolean not null default false,
  ownership_status text not null default 'clear'
    check (ownership_status in ('clear','ambiguous','disputed')),
  created_at timestamptz not null default now()
);

create index if not exists reviews_profile_idx on profile_reviews (profile_id);
create index if not exists reviews_org_idx on profile_reviews (organization_id);
create index if not exists reviews_source_idx on profile_reviews (source_id);

alter table profile_reviews enable row level security;
drop policy if exists "reviews_select" on profile_reviews;
create policy "reviews_select" on profile_reviews for select using (organization_id = current_org_id());
drop policy if exists "reviews_insert" on profile_reviews;
create policy "reviews_insert" on profile_reviews for insert with check (organization_id = current_org_id());
drop policy if exists "reviews_update" on profile_reviews;
create policy "reviews_update" on profile_reviews for update using (organization_id = current_org_id());
drop policy if exists "reviews_delete" on profile_reviews;
create policy "reviews_delete" on profile_reviews for delete using (organization_id = current_org_id() and public.is_admin());

-- ============================================================================
-- PROFILE CLAIMS (tracked extracted facts with provenance)
-- ============================================================================

create table if not exists profile_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  source_id uuid references profile_sources(id) on delete set null,
  claim_key text not null,
  claim_value text not null,
  evidence_type text not null default 'explicit_claim'
    check (evidence_type in ('fact','explicit_claim','strong_inference','weak_inference','unknown')),
  source_section text,
  source_page int,
  confidence numeric(3,2) check (confidence between 0 and 1),
  is_inferred boolean not null default false,
  user_corrected boolean not null default false,
  user_rejected boolean not null default false,
  extraction_version text not null default 'v2',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists claims_profile_idx on profile_claims (profile_id);
create index if not exists claims_org_idx on profile_claims (organization_id);
create index if not exists claims_key_idx on profile_claims (profile_id, claim_key);

alter table profile_claims enable row level security;
drop policy if exists "claims_select" on profile_claims;
create policy "claims_select" on profile_claims for select using (organization_id = current_org_id());
drop policy if exists "claims_insert" on profile_claims;
create policy "claims_insert" on profile_claims for insert with check (organization_id = current_org_id());
drop policy if exists "claims_update" on profile_claims;
create policy "claims_update" on profile_claims for update using (organization_id = current_org_id());
drop policy if exists "claims_delete" on profile_claims;
create policy "claims_delete" on profile_claims for delete using (organization_id = current_org_id() and public.is_admin());

-- ============================================================================
-- STORAGE: profile-sources bucket
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-sources',
  'profile-sources',
  false,
  20971520, -- 20 MB
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','text/plain','text/markdown','text/csv']
)
on conflict (id) do nothing;

-- Storage policies for profile-sources bucket
-- SELECT: org members can read
drop policy if exists "profile_sources_select" on storage.objects;
create policy "profile_sources_select" on storage.objects
  for select using (
    bucket_id = 'profile-sources'
    and (storage.foldername(name))[1] = (select organization_id::text from reps where auth_user_id = auth.uid() limit 1)
  );

-- INSERT: org members can upload to their org folder
drop policy if exists "profile_sources_insert" on storage.objects;
create policy "profile_sources_insert" on storage.objects
  for insert with check (
    bucket_id = 'profile-sources'
    and (storage.foldername(name))[1] = (select organization_id::text from reps where auth_user_id = auth.uid() limit 1)
  );

-- DELETE: admin only
drop policy if exists "profile_sources_delete" on storage.objects;
create policy "profile_sources_delete" on storage.objects
  for delete using (
    bucket_id = 'profile-sources'
    and (storage.foldername(name))[1] = (select organization_id::text from reps where auth_user_id = auth.uid() limit 1)
    and (select role from reps where auth_user_id = auth.uid() limit 1) = 'admin'
  );
