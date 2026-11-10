-- ============================================================================
-- RELAY V5.1 — Upwork lifecycle + operational truth
--
-- One canonical job lifecycle, a first-class application model, proposal
-- versioning, persisted screening answers, real connects, and communication
-- history that is no longer mistaken for applications.
--
-- Live DB verified before writing (2026-11-10):
--   upwork_jobs.status CHECK = ('new','drafted','applied','replied','no','dead')
--   upwork_jobs rows: 117 new, 11 applied, 1 drafted, 2 replied, 0 no/dead
--   upwork_applications rows: 0 (table unused by code)
--   upwork_messages rows: 166 (156 cover, 5 followup, 5 reply)
-- ============================================================================

-- ============================================================================
-- 1. Canonical job lifecycle
-- ============================================================================
-- Drop the old constraint first: mapping rows onto new values would otherwise
-- violate it. `no` has no live rows and means "passed" — archived, not a loss.
alter table upwork_jobs drop constraint if exists upwork_jobs_status_check;

update upwork_jobs set status = case status
  when 'new' then 'SAVED'
  when 'drafted' then 'DRAFT_READY'
  when 'applied' then 'APPLIED'
  when 'replied' then 'CLIENT_REPLIED'
  when 'dead' then 'ARCHIVED'
  when 'no' then 'ARCHIVED'
  else 'SAVED'
end;

alter table upwork_jobs add constraint upwork_jobs_status_check
  check (status in ('SAVED','DRAFT_READY','APPLIED','CLIENT_REPLIED','INTERVIEW','WON','LOST','ARCHIVED'));
alter table upwork_jobs alter column status set default 'SAVED';

-- Job ownership: the sending identity is explicit, never inferred from the owner.
alter table upwork_jobs add column if not exists revenue_identity_id uuid;
alter table upwork_jobs add column if not exists archived_at timestamptz;
create index if not exists upwork_jobs_revenue_identity_idx on upwork_jobs (revenue_identity_id);

comment on column upwork_jobs.revenue_identity_id is
  'The Upwork identity this job is applied as. Attribution only — it never changes the job''s owner.';
comment on column upwork_jobs.archived_at is
  'When the job left the active queue. Archive preserves every child row.';

-- ============================================================================
-- 2. Proposal versions — the submitted text and its evidence
-- ============================================================================
create table if not exists upwork_proposal_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references upwork_jobs(id) on delete cascade,
  rep_id uuid references reps(id) on delete set null,
  profile_id uuid references profiles(id) on delete set null,
  revenue_identity_id uuid,
  proposal_text text not null,
  model_tier text,
  prompt_version text,
  proof_refs jsonb not null default '[]'::jsonb,
  screening_answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists upv_job_idx on upwork_proposal_versions (job_id, created_at desc);
create index if not exists upv_org_idx on upwork_proposal_versions (organization_id);

alter table upwork_proposal_versions enable row level security;
drop policy if exists upv_select on upwork_proposal_versions;
create policy upv_select on upwork_proposal_versions for select
  using (organization_id = current_org_id());
drop policy if exists upv_insert on upwork_proposal_versions;
create policy upv_insert on upwork_proposal_versions for insert
  with check (organization_id = current_org_id());

-- ============================================================================
-- 3. First-class application model
-- ============================================================================
-- The table was created unused (0 rows, no code consumers), so it is reshaped
-- to the canonical contract instead of adding a second authority.
alter table upwork_applications rename column owner_rep_id to rep_id;
alter table upwork_applications rename column profile_id to person_profile_id;
alter table upwork_applications rename column cover_letter to proposal_text;
alter table upwork_applications rename column question_answers to screening_answers;

alter table upwork_applications add column if not exists revenue_identity_id uuid;
alter table upwork_applications add column if not exists submitted_at timestamptz;
alter table upwork_applications add column if not exists proposal_version_id uuid
  references upwork_proposal_versions(id) on delete set null;
alter table upwork_applications add column if not exists connects_spent integer;
alter table upwork_applications add column if not exists boost_connects integer not null default 0;
alter table upwork_applications add column if not exists first_reply_at timestamptz;
alter table upwork_applications add column if not exists latest_reply_at timestamptz;
alter table upwork_applications add column if not exists interview_at timestamptz;
alter table upwork_applications add column if not exists won_at timestamptz;
alter table upwork_applications add column if not exists lost_at timestamptz;
alter table upwork_applications add column if not exists archived_at timestamptz;

-- The table was unused; any leftover pre-migration row becomes a submitted
-- application so the new constraint can be applied without inventing a draft.
update upwork_applications set status = 'submitted' where status is distinct from 'submitted';

alter table upwork_applications drop constraint if exists upwork_applications_status_check;
alter table upwork_applications add constraint upwork_applications_status_check
  check (status in ('submitted','archived'));
alter table upwork_applications alter column status set default 'submitted';

-- One submitted application per job: a double-click can never create a second.
create unique index if not exists upwork_applications_job_uniq
  on upwork_applications (job_id);

-- ============================================================================
-- 3b. Atomic application submission
-- ============================================================================
-- The proposal version, the application row and the job status commit together.
-- A concurrent double-click returns the existing application instead of failing.
create or replace function public.submit_upwork_application(
  p_org_id uuid,
  p_job_id uuid,
  p_rep_id uuid,
  p_revenue_identity_id uuid,
  p_person_profile_id uuid,
  p_proposal_text text,
  p_model_tier text,
  p_prompt_version text,
  p_proof_refs jsonb,
  p_screening_answers jsonb,
  p_connects_spent integer,
  p_boost_connects integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version_id uuid;
  v_application_id uuid;
begin
  select id into v_application_id from upwork_applications where job_id = p_job_id;
  if v_application_id is not null then
    return v_application_id;
  end if;

  insert into upwork_proposal_versions
    (organization_id, job_id, rep_id, profile_id, revenue_identity_id, proposal_text, model_tier, prompt_version, proof_refs, screening_answers)
  values
    (p_org_id, p_job_id, p_rep_id, p_person_profile_id, p_revenue_identity_id, p_proposal_text, p_model_tier, p_prompt_version, coalesce(p_proof_refs, '[]'::jsonb), coalesce(p_screening_answers, '[]'::jsonb))
  returning id into v_version_id;

  insert into upwork_applications
    (organization_id, job_id, rep_id, revenue_identity_id, person_profile_id, submitted_at, proposal_text, proposal_version_id, connects_spent, boost_connects, screening_answers, status)
  values
    (p_org_id, p_job_id, p_rep_id, p_revenue_identity_id, p_person_profile_id, now(), p_proposal_text, v_version_id, p_connects_spent, coalesce(p_boost_connects, 0), coalesce(p_screening_answers, '[]'::jsonb), 'submitted')
  returning id into v_application_id;

  update upwork_jobs
    set status = 'APPLIED',
        revenue_identity_id = coalesce(p_revenue_identity_id, revenue_identity_id),
        connects_used = coalesce(p_connects_spent, connects_used),
        updated_at = now()
    where id = p_job_id and organization_id = p_org_id;

  return v_application_id;
exception when unique_violation then
  select id into v_application_id from upwork_applications where job_id = p_job_id;
  return v_application_id;
end;
$$;

create index if not exists upwork_applications_rep_idx on upwork_applications (rep_id);
create index if not exists upwork_applications_submitted_idx
  on upwork_applications (organization_id, submitted_at desc);
create index if not exists upwork_applications_identity_idx
  on upwork_applications (revenue_identity_id);
create index if not exists upwork_applications_job_submitted_idx
  on upwork_applications (job_id, submitted_at desc);

-- Applications are never deleted; archive preserves them.
drop policy if exists ua_update on upwork_applications;
create policy ua_update on upwork_applications for update
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

comment on table upwork_applications is
  'Canonical submitted-application authority. A generated proposal is not an application.';

-- ============================================================================
-- 3c. Canonical follow-up tasks
-- ============================================================================
-- The follow-up enters the existing assigned-task engine; no second scheduler.
alter table assigned_tasks add column if not exists job_id uuid references upwork_jobs(id) on delete cascade;
alter table assigned_tasks add column if not exists revenue_identity_id uuid;
alter table assigned_tasks drop constraint if exists assigned_tasks_kind_check;
alter table assigned_tasks add constraint assigned_tasks_kind_check
  check (kind in ('ADMIN','REVIEW','CALL','RESEARCH','PREPARE_PROPOSAL','CUSTOM','REQUEST_UPDATE','FOLLOW_UP'));
create index if not exists assigned_tasks_job_idx on assigned_tasks (job_id);

-- ============================================================================
-- 4. Communication history is not an application record
-- ============================================================================
-- Inbound client messages get an explicit direction and body; draft_text is
-- never the semantic home of a received message again.
alter table upwork_messages add column if not exists direction text not null default 'outbound';
alter table upwork_messages add column if not exists body text;
alter table upwork_messages drop constraint if exists upwork_messages_direction_check;
alter table upwork_messages add constraint upwork_messages_direction_check
  check (direction in ('outbound','inbound'));
create index if not exists upwork_messages_direction_idx on upwork_messages (job_id, direction);

-- ============================================================================
-- 5. Event taxonomy
-- ============================================================================
alter table action_events drop constraint if exists action_events_action_type_check;
alter table action_events add constraint action_events_action_type_check
  check (action_type in (
    'LEAD_EXTRACTED',
    'CONNECTION_PREPARED',
    'CONNECTION_SENT',
    'DM_PREPARED',
    'DM_SENT',
    'FOLLOWUP_SENT',
    'REPLY_SENT',
    'REPLY_RECEIVED',
    'LEAD_REFERRED',
    'PROFILE_RECOMMENDED',
    'UPWORK_JOB_EXTRACTED',
    'UPWORK_JOB_SAVED',
    'UPWORK_PROPOSAL_PREPARED',
    'UPWORK_APPLIED',
    'UPWORK_APPLICATION_SUBMITTED',
    'UPWORK_FOLLOWUP_SENT',
    'UPWORK_CLIENT_REPLIED',
    'UPWORK_INTERVIEW',
    'UPWORK_WON',
    'UPWORK_LOST',
    'UPWORK_ARCHIVED',
    'UPWORK_DELETED',
    'OPPORTUNITY_CREATED',
    'MEETING_BOOKED',
    'CLIENT_WON',
    'LEAD_ARCHIVED',
    'RECOMMENDATION_SHOWN',
    'RECOMMENDATION_ACTED'
  ));

-- UPWORK_APPLIED is legacy-only: new writes use UPWORK_APPLICATION_SUBMITTED.
comment on column action_events.action_type is
  'UPWORK_APPLIED is retained for historical rows; new applications emit UPWORK_APPLICATION_SUBMITTED.';
