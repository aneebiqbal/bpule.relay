-- ============================================================================
-- Aiven build repairs.
--
-- Columns the migration chain expects but the consolidated catch-up predates
-- (added out-of-band on Neon). Applied after the catch-up and before the
-- numbered chain. All idempotent.
-- ============================================================================

-- upwork_applications: the V5.1 canonical shape (the contract migration drops
-- the legacy columns; the backfill and submit RPC use these).
alter table upwork_applications add column if not exists rep_id uuid references reps(id) on delete set null;
alter table upwork_applications add column if not exists person_profile_id uuid references profiles(id) on delete set null;
alter table upwork_applications add column if not exists revenue_identity_id uuid references revenue_identities(id) on delete set null;
alter table upwork_applications add column if not exists submitted_at timestamptz;
alter table upwork_applications add column if not exists proposal_text text;
alter table upwork_applications add column if not exists proposal_version_id uuid;
alter table upwork_applications add column if not exists connects_spent integer;
alter table upwork_applications add column if not exists boost_connects integer;
alter table upwork_applications add column if not exists screening_answers jsonb default '[]'::jsonb;

-- relay_runs: sender attribution for the V6.3 attribution backfill.
alter table relay_runs add column if not exists sender_profile_id uuid references profiles(id) on delete set null;

-- One canonical application per job (the V5.1 backfill uses ON CONFLICT (job_id)).
create unique index if not exists ua_one_per_job_idx on upwork_applications (job_id);

-- upwork_proposal_versions: the V5.1 submit RPC writes here; the table was
-- created out-of-band on Neon and is not in the numbered chain.
create table if not exists upwork_proposal_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references upwork_jobs(id) on delete cascade,
  rep_id uuid references reps(id) on delete set null,
  profile_id uuid references profiles(id) on delete set null,
  revenue_identity_id uuid references revenue_identities(id) on delete set null,
  proposal_text text not null,
  model_tier text,
  prompt_version text,
  proof_refs jsonb not null default '[]'::jsonb,
  screening_answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists upv_job_idx on upwork_proposal_versions (job_id);

-- upwork_jobs.revenue_identity_id: the V5.1 submit RPC writes it.
alter table upwork_jobs add column if not exists revenue_identity_id uuid references revenue_identities(id) on delete set null;

-- relay_events.actor_rep_id: the close_anon_exposure policy references it; the
-- column was added out-of-band on Neon.
alter table relay_events add column if not exists actor_rep_id uuid references reps(id) on delete set null;

-- upwork_applications.first_reply_at: the V5.1 reply backfill writes it.
alter table upwork_applications add column if not exists first_reply_at timestamptz;
alter table upwork_applications add column if not exists latest_reply_at timestamptz;

-- accountability_audit_log.actor_id: the close_anon_exposure policy references
-- it (the table carries rep_id).
alter table accountability_audit_log add column if not exists actor_id uuid references reps(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Out-of-band columns the consolidated catch-up predates (live Neon/Supabase
-- schema, verified against the Supabase OpenAPI definition).
-- ---------------------------------------------------------------------------
alter table accountability_audit_log add column if not exists action text;
alter table accountability_audit_log add column if not exists new_value jsonb;
alter table accountability_audit_log add column if not exists previous_value jsonb;
alter table accountability_audit_log add column if not exists target_id uuid;
alter table accountability_audit_log add column if not exists target_table text;

alter table eval_runs add column if not exists selfcheck_pass_rate integer;

alter table notifications add column if not exists message text;
alter table notifications add column if not exists metadata jsonb;
alter table notifications add column if not exists rep_id uuid references reps(id) on delete set null;
alter table notifications add column if not exists type text;

alter table relay_runs add column if not exists current_phase text;
alter table relay_runs add column if not exists error_message text;
alter table relay_runs add column if not exists result_snapshot jsonb;
alter table relay_runs add column if not exists strategy_snapshot jsonb;

alter table upwork_applications add column if not exists cover_letter text;
alter table upwork_applications add column if not exists owner_rep_id uuid references reps(id) on delete set null;
alter table upwork_applications add column if not exists profile_id uuid references profiles(id) on delete set null;
alter table upwork_applications add column if not exists question_answers jsonb;

-- close_anon_exposure helpers (that migration rolled back on a later statement).
create or replace function public.request_is_service_role() returns boolean
language sql stable set search_path = public as
$$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  ) is not distinct from 'service_role';
$$;

create or replace function public.caller_may_act_for(p_org_id uuid, p_person_id uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select public.request_is_service_role() or (
    p_org_id is not null
    and p_org_id = public.current_org_id()
    and (
      p_person_id is null
      or p_person_id = public.current_rep_id()
      or (public.is_org_admin() and exists (
        select 1 from reps r where r.id = p_person_id and r.organization_id = p_org_id))
    )
  );
$$;
