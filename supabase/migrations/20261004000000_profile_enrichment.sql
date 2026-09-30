-- 20261004000000: Profile Enrichment + Safe Profile Merge
--
-- INVARIANT: PROFILE IDENTITY IS PERMANENT. IMPORT ENRICHES THE PROFILE.
-- IMPORT NEVER DESTROYS RELATIONSHIPS.
--
-- Strictly additive:
--   * new nullable columns on existing tables (no defaults that rewrite data
--     semantics, no drops, no type changes)
--   * new tables (enrichment runs, experience history, merge audit log)
--   * partial unique indexes on NEW fingerprint columns only (every existing
--     row has NULL there, so they cannot collide with production data)
--   * two transactional RPCs callable only by service_role
--
-- No DELETE / TRUNCATE / cascade changes / FK clearing on existing data.
-- Idempotent: safe to re-run.

-- ============================================================================
-- 1. Columns on existing tables
-- ============================================================================

-- profiles.updated_at is written by application code but was never created by
-- any migration in this repo. Added here for optimistic-concurrency + audit.
alter table profiles add column if not exists updated_at timestamptz default now();
-- Set only by merge_profiles() on the archived duplicate (B → A).
alter table profiles add column if not exists merged_into_profile_id uuid references profiles(id) on delete restrict;

alter table profile_sources add column if not exists updated_at timestamptz default now();
alter table profile_sources add column if not exists enrichment_run_id uuid;
alter table profile_sources add column if not exists content_fingerprint text;
alter table profile_sources add column if not exists extraction_result jsonb;

-- Claims become the provenance ledger for every imported fact.
alter table profile_claims add column if not exists authority text
  check (authority in ('human_verified','trusted_source_fact','ai_extracted_fact','strong_inference','weak_inference'));
alter table profile_claims add column if not exists merge_action text
  check (merge_action in ('new_fact','update','duplicate','conflict','unknown','historical','human_edit'));
alter table profile_claims add column if not exists claim_status text
  check (claim_status in ('active','conflict','historical','superseded','unknown'));
alter table profile_claims add column if not exists previous_value text;
alter table profile_claims add column if not exists enrichment_run_id uuid;
alter table profile_claims add column if not exists source_filename text;
alter table profile_claims add column if not exists claim_fingerprint text;
alter table profile_claims add column if not exists corroborating_source_ids uuid[] not null default '{}';
alter table profile_claims add column if not exists approved_by uuid;
create unique index if not exists profile_claims_fingerprint_uniq
  on profile_claims (profile_id, claim_fingerprint) where claim_fingerprint is not null;

alter table portfolio_projects add column if not exists content_fingerprint text;
alter table portfolio_projects add column if not exists source_id uuid references profile_sources(id) on delete set null;
alter table portfolio_projects add column if not exists enrichment_run_id uuid;
alter table portfolio_projects add column if not exists client_company text;
alter table portfolio_projects add column if not exists start_date text;
alter table portfolio_projects add column if not exists end_date text;
alter table portfolio_projects add column if not exists outcome text;
alter table portfolio_projects add column if not exists authority text;
create unique index if not exists portfolio_projects_fingerprint_uniq
  on portfolio_projects (profile_id, content_fingerprint) where content_fingerprint is not null;

alter table proof_cards add column if not exists content_fingerprint text;
alter table proof_cards add column if not exists source_id uuid references profile_sources(id) on delete set null;
alter table proof_cards add column if not exists enrichment_run_id uuid;
alter table proof_cards add column if not exists authority text;
create unique index if not exists proof_cards_fingerprint_uniq
  on proof_cards (profile_id, content_fingerprint) where content_fingerprint is not null;

alter table profile_reviews add column if not exists content_fingerprint text;
alter table profile_reviews add column if not exists enrichment_run_id uuid;
alter table profile_reviews add column if not exists authority text;
create unique index if not exists profile_reviews_fingerprint_uniq
  on profile_reviews (profile_id, content_fingerprint) where content_fingerprint is not null;

-- ============================================================================
-- 2. Enrichment runs (dry-run proposal + immutable-once-applied audit)
-- ============================================================================

create table if not exists profile_enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- RESTRICT: an audited profile can never be silently deleted.
  profile_id uuid not null references profiles(id) on delete restrict,
  import_batch_id uuid references profile_import_batches(id) on delete set null,
  status text not null default 'uploaded'
    check (status in ('uploaded','extracting','proposed','applying','applied','failed','discarded')),
  source_ids uuid[] not null default '{}',
  actor_rep_id uuid references reps(id) on delete set null,
  proposal jsonb,
  decisions jsonb,
  audit jsonb,
  profile_snapshot_before jsonb,
  relationship_counts_before jsonb,
  relationship_counts_after jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proposed_at timestamptz,
  applied_at timestamptz
);
create index if not exists enrichment_runs_profile_idx on profile_enrichment_runs (profile_id, created_at desc);
create index if not exists enrichment_runs_org_idx on profile_enrichment_runs (organization_id, created_at desc);

alter table profile_enrichment_runs enable row level security;
drop policy if exists "enrichment_runs_select" on profile_enrichment_runs;
create policy "enrichment_runs_select" on profile_enrichment_runs for select using (organization_id = current_org_id());
-- Writes go through the service role only.

-- ============================================================================
-- 3. Experience history (chronology: old role + new role both preserved)
-- ============================================================================

create table if not exists profile_experience (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete restrict,
  role text,
  company text,
  start_date text,
  end_date text,
  is_current boolean not null default false,
  authority text,
  source_id uuid references profile_sources(id) on delete set null,
  enrichment_run_id uuid,
  content_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profile_experience_profile_idx on profile_experience (profile_id);
create unique index if not exists profile_experience_fingerprint_uniq
  on profile_experience (profile_id, content_fingerprint) where content_fingerprint is not null;

alter table profile_experience enable row level security;
drop policy if exists "profile_experience_select" on profile_experience;
create policy "profile_experience_select" on profile_experience for select using (organization_id = current_org_id());

-- ============================================================================
-- 4. Immutable merge audit log
-- ============================================================================

create table if not exists profile_merge_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  -- Plain uuids (no FK) so the audit record can outlive anything.
  source_profile_id uuid not null,
  target_profile_id uuid not null,
  actor_rep_id uuid,
  identity_check jsonb,
  counts_before jsonb not null,
  counts_after jsonb not null,
  reassigned_refs jsonb not null,
  removed_duplicates jsonb not null,
  merged_fields jsonb not null,
  source_snapshot jsonb not null,
  target_snapshot_before jsonb not null,
  created_at timestamptz not null default now()
);
alter table profile_merge_log enable row level security;
drop policy if exists "profile_merge_log_select" on profile_merge_log;
create policy "profile_merge_log_select" on profile_merge_log for select using (organization_id = current_org_id());

create or replace function profile_merge_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'profile_merge_log is append-only';
end $$;
drop trigger if exists profile_merge_log_no_update on profile_merge_log;
create trigger profile_merge_log_no_update before update or delete on profile_merge_log
  for each row execute function profile_merge_log_immutable();

-- ============================================================================
-- 5. Helpers
-- ============================================================================

-- Every column in the database that references a profile id:
--   * every single-column FK pointing at profiles(id), plus
--   * FK-less uuid columns literally named profile_id / sender_profile_id
--     (schema drift safety net: some environments were patched by hand).
-- Discovered dynamically so tables added later are automatically covered.
create or replace function profile_fk_columns()
returns table (table_name text, column_name text)
language sql stable as $$
  select distinct t, col from (
    select c.conrelid::regclass::text as t, a.attname::text as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and array_length(c.conkey, 1) = 1
    union
    select format('%I', ic.table_name), ic.column_name::text
    from information_schema.columns ic
    join information_schema.tables it on it.table_schema = ic.table_schema and it.table_name = ic.table_name
    where ic.table_schema = 'public' and it.table_type = 'BASE TABLE'
      and ic.column_name in ('profile_id', 'sender_profile_id') and ic.data_type = 'uuid'
  ) x
  order by 1, 2
$$;

create or replace function profile_relationship_counts(p_profile_id uuid)
returns jsonb
language plpgsql stable as $$
declare
  r record;
  n bigint;
  result jsonb := '{}'::jsonb;
begin
  for r in select * from profile_fk_columns() loop
    execute format('select count(*) from %s where %I = $1', r.table_name, r.column_name)
      into n using p_profile_id;
    result := result || jsonb_build_object(r.table_name || '.' || r.column_name, n);
  end loop;
  return result;
end $$;

create or replace function profile_row_inbound_refs(p_table text, p_id uuid)
returns bigint
language plpgsql stable as $$
declare fk record; cnt bigint; total bigint := 0;
begin
  for fk in select c.conrelid::regclass::text as t, a.attname::text as col
            from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid = p_table::regclass and array_length(c.conkey, 1) = 1 loop
    execute format('select count(*) from %s where %I = $1', fk.t, fk.col) into cnt using p_id;
    total := total + cnt;
  end loop;
  return total;
end $$;

create or replace function authority_rank(a text) returns int
language sql immutable as $$
  select case a
    when 'human_verified' then 5
    when 'trusted_source_fact' then 4
    when 'ai_extracted_fact' then 3
    when 'strong_inference' then 2
    when 'weak_inference' then 1
    else 0 end
$$;

-- ============================================================================
-- 6. apply_profile_enrichment — one transaction, all-or-nothing.
--
-- The plan is computed (and shown to the user as a dry-run diff) in the app.
-- This function re-validates it against live state and refuses anything that
-- is not strictly additive. Any failure raises → full rollback.
-- ============================================================================

create or replace function apply_profile_enrichment(
  p_run_id uuid,
  p_organization_id uuid,
  p_actor_rep_id uuid,
  p_plan jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run profile_enrichment_runs%rowtype;
  v_profile profiles%rowtype;
  v_profile_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_snapshot jsonb;
  v_item jsonb;
  v_field text;
  v_current text;
  v_existing jsonb;
  v_new jsonb;
  v_elem jsonb;
  v_key text;
  v_inserted int;
  v_counts jsonb := jsonb_build_object(
    'scalar_updates', 0, 'array_items_added', 0, 'projects_added', 0, 'projects_enriched', 0,
    'proofs_added', 0, 'reviews_added', 0, 'claims_recorded', 0, 'claims_corroborated', 0,
    'experience_added', 0, 'sources_linked', 0);
  -- Tables this function is allowed to add rows to. Every OTHER table that
  -- references profiles must have identical counts before and after.
  v_writable text[] := array[
    'portfolio_projects.profile_id','proof_cards.profile_id','profile_reviews.profile_id',
    'profile_claims.profile_id','profile_experience.profile_id','profile_sources.profile_id',
    'profile_enrichment_runs.profile_id'];
  v_scalar_fields text[] := array[
    'full_name','display_name','headline','current_role','company','location','bio',
    'professional_summary','seniority','years_experience','positioning'];
  v_array_fields text[] := array[
    'primary_skills','secondary_skills','technologies','industries','service_capabilities',
    'specialties','differentiators','languages'];
begin
  select * into v_run from profile_enrichment_runs where id = p_run_id for update;
  if not found then raise exception 'enrichment run % not found', p_run_id; end if;
  if v_run.organization_id <> p_organization_id then raise exception 'organization mismatch'; end if;
  if v_run.status <> 'proposed' then
    raise exception 'enrichment run % is %, expected proposed (already applied or discarded?)', p_run_id, v_run.status;
  end if;

  v_profile_id := v_run.profile_id;
  select * into v_profile from profiles where id = v_profile_id and organization_id = p_organization_id for update;
  if not found then raise exception 'profile % not found in organization', v_profile_id; end if;
  if v_profile.archived_at is not null then raise exception 'profile % is archived', v_profile_id; end if;

  v_snapshot := to_jsonb(v_profile);
  v_before := profile_relationship_counts(v_profile_id);

  -- ── Scalar fields: optimistic check against the value the diff was built on.
  for v_item in select * from jsonb_array_elements(coalesce(p_plan->'scalar_updates', '[]'::jsonb)) loop
    v_field := v_item->>'field';
    if not (v_field = any(v_scalar_fields)) then raise exception 'field % is not enrichable', v_field; end if;
    execute format('select (%I)::text from profiles where id = $1', v_field) into v_current using v_profile_id;
    if v_current is distinct from (v_item->>'expected') then
      -- numeric text forms can differ (5 vs 5.0)
      if not (v_field = 'years_experience' and v_current is not null and (v_item->>'expected') is not null
              and v_current::numeric = (v_item->>'expected')::numeric) then
        raise exception 'stale proposal: % changed since the diff was generated', v_field;
      end if;
    end if;
    if v_field = 'years_experience' then
      update profiles set years_experience = (v_item->>'value')::numeric where id = v_profile_id;
    else
      execute format('update profiles set %I = $1 where id = $2', v_field) using (v_item->>'value'), v_profile_id;
    end if;
    v_counts := jsonb_set(v_counts, '{scalar_updates}', to_jsonb((v_counts->>'scalar_updates')::int + 1));
  end loop;

  -- ── Array fields: append-only union (case-insensitive), never removes.
  for v_item in select * from jsonb_array_elements(coalesce(p_plan->'array_appends', '[]'::jsonb)) loop
    v_field := v_item->>'field';
    if not (v_field = any(v_array_fields)) then raise exception 'field % is not an enrichable list', v_field; end if;
    execute format('select coalesce(%I, ''[]''::jsonb) from profiles where id = $1', v_field) into v_existing using v_profile_id;
    v_new := v_existing;
    for v_elem in select * from jsonb_array_elements(coalesce(v_item->'items', '[]'::jsonb)) loop
      if not exists (
        select 1 from jsonb_array_elements_text(v_new) e where lower(trim(e)) = lower(trim(v_elem #>> '{}'))
      ) then
        v_new := v_new || jsonb_build_array(v_elem #>> '{}');
        v_counts := jsonb_set(v_counts, '{array_items_added}', to_jsonb((v_counts->>'array_items_added')::int + 1));
      end if;
    end loop;
    execute format('update profiles set %I = $1 where id = $2', v_field) using v_new, v_profile_id;
  end loop;

  -- ── Projects: insert new (fingerprint-deduped).
  for v_item in select * from jsonb_array_elements(coalesce(p_plan->'projects_insert', '[]'::jsonb)) loop
    insert into portfolio_projects (organization_id, profile_id, project_title, my_role, description, skills,
      technologies, source_kind, content_fingerprint, source_id, enrichment_run_id, client_company,
      start_date, end_date, outcome, authority)
    values (p_organization_id, v_profile_id, v_item->>'project_title', v_item->>'my_role', v_item->>'description',
      coalesce(array(select jsonb_array_elements_text(v_item->'technologies')), '{}'),
      coalesce(array(select jsonb_array_elements_text(v_item->'technologies')), '{}'),
      'import', v_item->>'fingerprint', nullif(v_item->>'source_id','')::uuid, p_run_id, v_item->>'client_company',
      v_item->>'start_date', v_item->>'end_date', v_item->>'outcome', v_item->>'authority')
    on conflict (profile_id, content_fingerprint) where content_fingerprint is not null do nothing;
    get diagnostics v_inserted = row_count;
    v_counts := jsonb_set(v_counts, '{projects_added}', to_jsonb((v_counts->>'projects_added')::int + v_inserted));
  end loop;

  -- ── Projects: enrich existing — fill EMPTY fields only, union technologies.
  for v_item in select * from jsonb_array_elements(coalesce(p_plan->'projects_enrich', '[]'::jsonb)) loop
    update portfolio_projects set
      my_role = coalesce(nullif(my_role, ''), v_item->>'my_role'),
      description = coalesce(nullif(description, ''), v_item->>'description'),
      client_company = coalesce(nullif(client_company, ''), v_item->>'client_company'),
      start_date = coalesce(nullif(start_date, ''), v_item->>'start_date'),
      end_date = coalesce(nullif(end_date, ''), v_item->>'end_date'),
      outcome = coalesce(nullif(outcome, ''), v_item->>'outcome'),
      technologies = array(select distinct unnest(technologies || coalesce(array(select jsonb_array_elements_text(v_item->'technologies')), '{}'))),
      skills = array(select distinct unnest(skills || coalesce(array(select jsonb_array_elements_text(v_item->'technologies')), '{}'))),
      updated_at = now()
    where id = (v_item->>'id')::uuid and profile_id = v_profile_id;
    get diagnostics v_inserted = row_count;
    if v_inserted <> 1 then raise exception 'project % does not belong to profile', v_item->>'id'; end if;
    v_counts := jsonb_set(v_counts, '{projects_enriched}', to_jsonb((v_counts->>'projects_enriched')::int + 1));
  end loop;

  -- ── Proofs
  for v_item in select * from jsonb_array_elements(coalesce(p_plan->'proofs_insert', '[]'::jsonb)) loop
    insert into proof_cards (organization_id, profile_id, capability, strength, safe_claim, source_type,
      source_reference, tags, verified, forbidden_claims, content_fingerprint, source_id, enrichment_run_id, authority)
    values (p_organization_id, v_profile_id, v_item->>'capability', v_item->>'strength', v_item->>'safe_claim',
      v_item->>'source_type', v_item->>'source_reference',
      coalesce(array(select jsonb_array_elements_text(v_item->'tags')), '{}'),
      false, '{}', v_item->>'fingerprint', nullif(v_item->>'source_id','')::uuid, p_run_id, v_item->>'authority')
    on conflict (profile_id, content_fingerprint) where content_fingerprint is not null do nothing;
    get diagnostics v_inserted = row_count;
    v_counts := jsonb_set(v_counts, '{proofs_added}', to_jsonb((v_counts->>'proofs_added')::int + v_inserted));
  end loop;

  -- ── Reviews
  for v_item in select * from jsonb_array_elements(coalesce(p_plan->'reviews_insert', '[]'::jsonb)) loop
    insert into profile_reviews (organization_id, profile_id, source_id, review_text, reviewer_name, reviewer_company,
      project_context, relevant_skills, evidence_type, confidence, safe_for_outreach, ownership_status,
      content_fingerprint, enrichment_run_id, authority)
    values (p_organization_id, v_profile_id, nullif(v_item->>'source_id','')::uuid, v_item->>'review_text',
      v_item->>'reviewer_name', v_item->>'reviewer_company', v_item->>'project_context',
      coalesce(v_item->'relevant_skills', '[]'::jsonb), coalesce(v_item->>'evidence_type', 'explicit_claim'),
      (v_item->>'confidence')::numeric, coalesce((v_item->>'safe_for_outreach')::boolean, false),
      coalesce(v_item->>'ownership_status', 'clear'), v_item->>'fingerprint', p_run_id, v_item->>'authority')
    on conflict (profile_id, content_fingerprint) where content_fingerprint is not null do nothing;
    get diagnostics v_inserted = row_count;
    v_counts := jsonb_set(v_counts, '{reviews_added}', to_jsonb((v_counts->>'reviews_added')::int + v_inserted));
  end loop;

  -- ── Experience history (both old and new roles preserved).
  for v_item in select * from jsonb_array_elements(coalesce(p_plan->'experience_insert', '[]'::jsonb)) loop
    insert into profile_experience (organization_id, profile_id, role, company, start_date, end_date, is_current,
      authority, source_id, enrichment_run_id, content_fingerprint)
    values (p_organization_id, v_profile_id, v_item->>'role', v_item->>'company', v_item->>'start_date',
      v_item->>'end_date', coalesce((v_item->>'is_current')::boolean, false), v_item->>'authority',
      nullif(v_item->>'source_id','')::uuid, p_run_id, v_item->>'fingerprint')
    on conflict (profile_id, content_fingerprint) where content_fingerprint is not null do nothing;
    get diagnostics v_inserted = row_count;
    v_counts := jsonb_set(v_counts, '{experience_added}', to_jsonb((v_counts->>'experience_added')::int + v_inserted));
  end loop;
  -- Exactly one current role, chosen by the plan (never inferred here).
  if p_plan ? 'experience_current_fingerprint' and (p_plan->>'experience_current_fingerprint') is not null then
    update profile_experience set is_current = (content_fingerprint = p_plan->>'experience_current_fingerprint'),
      updated_at = now()
    where profile_id = v_profile_id;
  end if;

  -- ── Claims (provenance ledger). Re-import of the same fact corroborates, never duplicates.
  for v_item in select * from jsonb_array_elements(coalesce(p_plan->'claims_insert', '[]'::jsonb)) loop
    if exists (select 1 from profile_claims where profile_id = v_profile_id and claim_fingerprint = v_item->>'fingerprint') then
      v_counts := jsonb_set(v_counts, '{claims_corroborated}', to_jsonb((v_counts->>'claims_corroborated')::int + 1));
    else
      v_counts := jsonb_set(v_counts, '{claims_recorded}', to_jsonb((v_counts->>'claims_recorded')::int + 1));
    end if;
    insert into profile_claims (organization_id, profile_id, source_id, claim_key, claim_value, evidence_type,
      confidence, is_inferred, user_corrected, extraction_version, authority, merge_action, claim_status,
      previous_value, enrichment_run_id, source_filename, claim_fingerprint, corroborating_source_ids, approved_by)
    values (p_organization_id, v_profile_id, nullif(v_item->>'source_id','')::uuid, v_item->>'claim_key',
      v_item->>'claim_value', coalesce(v_item->>'evidence_type', 'explicit_claim'),
      (v_item->>'confidence')::numeric, coalesce((v_item->>'is_inferred')::boolean, false),
      coalesce((v_item->>'user_corrected')::boolean, false), 'v2-enrich', v_item->>'authority',
      v_item->>'merge_action', v_item->>'claim_status', v_item->>'previous_value', p_run_id,
      v_item->>'source_filename', v_item->>'fingerprint',
      case when nullif(v_item->>'source_id','') is null then '{}'::uuid[] else array[(v_item->>'source_id')::uuid] end,
      case when coalesce((v_item->>'user_corrected')::boolean, false) then p_actor_rep_id else null end)
    on conflict (profile_id, claim_fingerprint) where claim_fingerprint is not null do update
      set corroborating_source_ids = (
            select coalesce(array_agg(distinct s), '{}') from unnest(
              profile_claims.corroborating_source_ids || excluded.corroborating_source_ids) s),
          -- a human decision can raise authority; nothing ever lowers it
          authority = case when authority_rank(excluded.authority) > authority_rank(profile_claims.authority)
                           then excluded.authority else profile_claims.authority end,
          user_corrected = profile_claims.user_corrected or excluded.user_corrected,
          claim_status = case when excluded.user_corrected then excluded.claim_status else profile_claims.claim_status end,
          updated_at = now();
  end loop;

  -- ── Superseded claims (when a human accepted a replacement value).
  for v_item in select * from jsonb_array_elements(coalesce(p_plan->'claims_supersede', '[]'::jsonb)) loop
    update profile_claims set claim_status = 'historical', updated_at = now()
    where profile_id = v_profile_id and claim_key = v_item->>'claim_key'
      and claim_status = 'active' and claim_value is distinct from v_item->>'keep_value';
  end loop;

  -- ── Link sources. Never steal a source that belongs to another profile and
  --    never link a second copy of an already-linked file.
  update profile_sources s
     set profile_id = v_profile_id, updated_at = now()
   where s.id = any(v_run.source_ids)
     and s.organization_id = p_organization_id
     and s.profile_id is null
     and not exists (
       select 1 from profile_sources o
        where o.profile_id = v_profile_id and o.id <> s.id and o.file_hash = s.file_hash and o.file_hash <> ''
     );
  get diagnostics v_inserted = row_count;
  v_counts := jsonb_set(v_counts, '{sources_linked}', to_jsonb(v_inserted));

  -- ── Derived counters
  update profiles set
    source_count = (select count(*) from profile_sources where profile_id = v_profile_id),
    proof_count = (select count(*) from proof_cards where profile_id = v_profile_id),
    updated_at = now()
  where id = v_profile_id;

  -- ── Invariant checks (raise → rollback everything).
  if not exists (select 1 from profiles where id = v_profile_id and organization_id = p_organization_id) then
    raise exception 'INVARIANT: profile id changed or vanished';
  end if;
  v_after := profile_relationship_counts(v_profile_id);
  for v_key in select jsonb_object_keys(v_before) loop
    if v_key = any(v_writable) then
      if (v_after->>v_key)::bigint < (v_before->>v_key)::bigint then
        raise exception 'INVARIANT: % shrank (% → %)', v_key, v_before->>v_key, v_after->>v_key;
      end if;
    elsif (v_after->>v_key) is distinct from (v_before->>v_key) then
      raise exception 'INVARIANT: relationship % changed (% → %)', v_key, v_before->>v_key, v_after->>v_key;
    end if;
  end loop;

  update profile_enrichment_runs set
    status = 'applied',
    decisions = p_plan->'decisions',
    audit = coalesce(p_plan->'audit', '{}'::jsonb) || jsonb_build_object('applied_counts', v_counts,
      'actor_rep_id', p_actor_rep_id, 'applied_at', now()),
    profile_snapshot_before = v_snapshot,
    relationship_counts_before = v_before,
    relationship_counts_after = v_after,
    applied_at = now(),
    updated_at = now()
  where id = p_run_id;

  return jsonb_build_object('profile_id', v_profile_id, 'counts', v_counts,
    'relationships_before', v_before, 'relationships_after', v_after);
end $$;

-- ============================================================================
-- 7. merge_profiles — explicit, never automatic. B (source) → A (target).
--
-- p_dry_run = true  → computes the full report, then raises a sentinel that
--                      rolls back every change (true dry-run of the real path).
-- p_dry_run = false → commits. B is ARCHIVED (merged_into_profile_id = A), not
--                      deleted.
-- ============================================================================

create or replace function merge_profiles(
  p_organization_id uuid,
  p_source_profile_id uuid,
  p_target_profile_id uuid,
  p_actor_rep_id uuid,
  p_dry_run boolean default true,
  p_identity_check jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_src profiles%rowtype;
  v_tgt profiles%rowtype;
  r record;
  row_rec record;
  v_ids uuid[];
  v_counts_before jsonb := '{}'::jsonb;
  v_counts_after jsonb := '{}'::jsonb;
  v_totals_before jsonb := '{}'::jsonb;
  v_totals_after jsonb := '{}'::jsonb;
  v_reassigned jsonb := '{}'::jsonb;
  v_removed jsonb := '[]'::jsonb;
  v_merged_fields jsonb := '{}'::jsonb;
  v_key text;
  v_n bigint;
  v_src_n bigint;
  v_tgt_n bigint;
  v_field text;
  v_val text;
  v_arr jsonb;
  v_report jsonb;
  v_log_id uuid;
  v_inbound bigint;
begin
  if p_source_profile_id = p_target_profile_id then raise exception 'cannot merge a profile into itself'; end if;

  -- Lock in deterministic order to avoid deadlocks.
  perform 1 from profiles where id in (p_source_profile_id, p_target_profile_id) order by id for update;
  select * into v_src from profiles where id = p_source_profile_id;
  select * into v_tgt from profiles where id = p_target_profile_id;
  if v_src.id is null or v_tgt.id is null then raise exception 'profile not found'; end if;
  if v_src.organization_id <> p_organization_id or v_tgt.organization_id <> p_organization_id then
    raise exception 'profiles must both belong to the organization';
  end if;
  if v_src.archived_at is not null then raise exception 'source profile is already archived'; end if;
  if v_tgt.archived_at is not null then raise exception 'target profile is archived'; end if;

  -- Counts before: per FK column for A, B, and table totals.
  for r in select * from profile_fk_columns() loop
    if r.table_name = 'profiles' then continue; end if;
    v_key := r.table_name || '.' || r.column_name;
    execute format('select count(*) filter (where %1$I = $1), count(*) filter (where %1$I = $2), count(*) from %2$s',
      r.column_name, r.table_name) into v_src_n, v_tgt_n, v_n using p_source_profile_id, p_target_profile_id;
    v_counts_before := v_counts_before || jsonb_build_object(v_key, jsonb_build_object('source', v_src_n, 'target', v_tgt_n));
    v_totals_before := v_totals_before || jsonb_build_object(r.table_name, v_n);
  end loop;

  -- Reassign every reference B → A, row by row so unique collisions are handled
  -- as duplicates (snapshotted into the log) instead of failing or cascading.
  for r in select * from profile_fk_columns() loop
    if r.table_name = 'profiles' then continue; end if; -- merged_into_profile_id handled below
    v_key := r.table_name || '.' || r.column_name;
    v_ids := '{}';
    for row_rec in execute format('select ctid as rid, to_jsonb(t) as snap from %s t where %I = $1', r.table_name, r.column_name)
                   using p_source_profile_id loop
      begin
        execute format('update %s set %I = $1 where ctid = $2', r.table_name, r.column_name)
          using p_target_profile_id, row_rec.rid;
        if row_rec.snap ? 'id' then v_ids := v_ids || (row_rec.snap->>'id')::uuid; end if;
      exception when unique_violation then
        -- A already has the equivalent row (e.g. same rep assignment / same voice).
        -- Only drop B's copy if nothing references it; otherwise abort the merge.
        if row_rec.snap ? 'id' and profile_row_inbound_refs(r.table_name, (row_rec.snap->>'id')::uuid) > 0 then
          raise exception 'merge blocked: duplicate % row % is referenced elsewhere — resolve manually',
            r.table_name, row_rec.snap->>'id';
        end if;
        v_removed := v_removed || jsonb_build_array(jsonb_build_object('table', r.table_name, 'reason', 'unique_collision', 'row', row_rec.snap));
        execute format('delete from %s where ctid = $1', r.table_name) using row_rec.rid;
      end;
    end loop;
    if array_length(v_ids, 1) > 0 then
      -- preserves historical attribution: exactly which rows were B's
      v_reassigned := v_reassigned || jsonb_build_object(v_key, to_jsonb(v_ids));
    end if;
  end loop;

  -- Content-level dedupe of evidence (same claim/title/text now twice on A).
  -- Keep the oldest; drop later copies only if unreferenced.
  for row_rec in
    select 'proof_cards' as t, id from (
      select id, row_number() over (partition by lower(trim(safe_claim)) order by created_at, id) rn
      from proof_cards where profile_id = p_target_profile_id) x where rn > 1
    union all
    select 'portfolio_projects', id from (
      select id, row_number() over (partition by lower(trim(project_title)) order by created_at, id) rn
      from portfolio_projects where profile_id = p_target_profile_id) x where rn > 1
    union all
    select 'profile_reviews', id from (
      select id, row_number() over (partition by lower(trim(review_text)) order by created_at, id) rn
      from profile_reviews where profile_id = p_target_profile_id) x where rn > 1
  loop
    v_inbound := profile_row_inbound_refs(row_rec.t, row_rec.id);
    if v_inbound = 0 then
      execute format('select to_jsonb(t) from %s t where id = $1', row_rec.t) into v_arr using row_rec.id;
      v_removed := v_removed || jsonb_build_array(jsonb_build_object('table', row_rec.t, 'reason', 'content_duplicate', 'row', v_arr));
      execute format('delete from %s where id = $1', row_rec.t) using row_rec.id;
    end if;
  end loop;

  -- Merge profile fields: fill A's EMPTY scalars from B; union list fields.
  foreach v_field in array array['display_name','headline','current_role','company','location','bio',
      'professional_summary','seniority','positioning','profile_url'] loop
    execute format('select (%I)::text from profiles where id = $1', v_field) into v_val using p_target_profile_id;
    if v_val is null or v_val = '' then
      execute format('select (%I)::text from profiles where id = $1', v_field) into v_val using p_source_profile_id;
      if v_val is not null and v_val <> '' then
        execute format('update profiles set %1$I = (select %1$I from profiles where id = $2) where id = $1', v_field)
          using p_target_profile_id, p_source_profile_id;
        v_merged_fields := v_merged_fields || jsonb_build_object(v_field, v_val);
      end if;
    end if;
  end loop;
  foreach v_field in array array['primary_skills','secondary_skills','technologies','industries',
      'service_capabilities','specialties','differentiators','languages'] loop
    execute format($q$
      update profiles t set %1$I = coalesce(t.%1$I, '[]'::jsonb) || coalesce((
        select jsonb_agg(e) from jsonb_array_elements_text(coalesce(s.%1$I, '[]'::jsonb)) e
        where not exists (select 1 from jsonb_array_elements_text(coalesce(t.%1$I, '[]'::jsonb)) x
                          where lower(trim(x)) = lower(trim(e)))), '[]'::jsonb)
      from profiles s where t.id = $1 and s.id = $2 returning t.%1$I $q$, v_field)
      into v_arr using p_target_profile_id, p_source_profile_id;
  end loop;

  -- Archive B (no hard delete).
  update profiles set archived_at = now(), merged_into_profile_id = p_target_profile_id, updated_at = now()
   where id = p_source_profile_id;
  update profiles set
    source_count = (select count(*) from profile_sources where profile_id = p_target_profile_id),
    proof_count = (select count(*) from proof_cards where profile_id = p_target_profile_id),
    updated_at = now()
   where id = p_target_profile_id;

  -- Verify: B has zero references; A has exactly before(A)+before(B)-removed.
  for r in select * from profile_fk_columns() loop
    if r.table_name = 'profiles' then continue; end if;
    v_key := r.table_name || '.' || r.column_name;
    execute format('select count(*) filter (where %1$I = $1), count(*) filter (where %1$I = $2), count(*) from %2$s',
      r.column_name, r.table_name) into v_src_n, v_tgt_n, v_n using p_source_profile_id, p_target_profile_id;
    v_counts_after := v_counts_after || jsonb_build_object(v_key, jsonb_build_object('source', v_src_n, 'target', v_tgt_n));
    v_totals_after := v_totals_after || jsonb_build_object(r.table_name, v_n);
    if v_src_n <> 0 then raise exception 'FK integrity: % still references source profile', v_key; end if;
    select count(*) into v_n from jsonb_array_elements(v_removed) e where e->>'table' = r.table_name;
    if v_tgt_n <> ((v_counts_before->v_key->>'source')::bigint + (v_counts_before->v_key->>'target')::bigint - v_n) then
      raise exception 'count verification failed for %: expected %, got %', v_key,
        (v_counts_before->v_key->>'source')::bigint + (v_counts_before->v_key->>'target')::bigint - v_n, v_tgt_n;
    end if;
  end loop;

  v_report := jsonb_build_object(
    'dry_run', p_dry_run,
    'source_profile_id', p_source_profile_id,
    'target_profile_id', p_target_profile_id,
    'counts_before', v_counts_before,
    'counts_after', v_counts_after,
    'table_totals_before', v_totals_before,
    'table_totals_after', v_totals_after,
    'reassigned_refs', v_reassigned,
    'removed_duplicates', v_removed,
    'merged_fields', v_merged_fields);

  if p_dry_run then
    -- Roll back everything; the caller gets the report from the error detail.
    raise exception using errcode = 'P0001', message = 'MERGE_DRY_RUN', detail = v_report::text;
  end if;

  insert into profile_merge_log (organization_id, source_profile_id, target_profile_id, actor_rep_id, identity_check,
    counts_before, counts_after, reassigned_refs, removed_duplicates, merged_fields, source_snapshot, target_snapshot_before)
  values (p_organization_id, p_source_profile_id, p_target_profile_id, p_actor_rep_id, p_identity_check,
    v_counts_before, v_counts_after, v_reassigned, v_removed, v_merged_fields, to_jsonb(v_src), to_jsonb(v_tgt))
  returning id into v_log_id;

  return v_report || jsonb_build_object('merge_log_id', v_log_id);
end $$;

-- Wrapper so PostgREST callers get the dry-run report as a normal result.
create or replace function preview_profile_merge(
  p_organization_id uuid,
  p_source_profile_id uuid,
  p_target_profile_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare v_detail text;
begin
  perform merge_profiles(p_organization_id, p_source_profile_id, p_target_profile_id, null, true, '{}'::jsonb);
  raise exception 'unreachable';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  if sqlerrm = 'MERGE_DRY_RUN' then
    return v_detail::jsonb;
  end if;
  raise;
end $$;

revoke all on function apply_profile_enrichment(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function merge_profiles(uuid, uuid, uuid, uuid, boolean, jsonb) from public, anon, authenticated;
revoke all on function preview_profile_merge(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function profile_relationship_counts(uuid) from public, anon, authenticated;
grant execute on function apply_profile_enrichment(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function merge_profiles(uuid, uuid, uuid, uuid, boolean, jsonb) to service_role;
grant execute on function preview_profile_merge(uuid, uuid, uuid) to service_role;
grant execute on function profile_relationship_counts(uuid) to service_role;
