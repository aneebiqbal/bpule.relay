-- ============================================================================
-- RELAY V5.1 — CONTRACT PHASE
--
-- Runs ONLY after the V5.1 code is deployed and the backfill is verified.
-- Removes the legacy lowercase statuses, the legacy application columns and the
-- compatibility writes in the submission function, then reapplies the strict
-- canonical constraint.
-- ============================================================================

begin;

-- ============================================================================
-- 1. Strict canonical status constraint
-- ============================================================================
alter table upwork_jobs drop constraint if exists upwork_jobs_status_check;
alter table upwork_jobs add constraint upwork_jobs_status_check
  check (status in ('SAVED','DRAFT_READY','APPLIED','CLIENT_REPLIED','INTERVIEW','WON','LOST','ARCHIVED'));

-- ============================================================================
-- 2. Drop legacy application columns (the canonical columns hold the data)
-- ============================================================================
alter table upwork_applications drop column if exists owner_rep_id;
alter table upwork_applications drop column if exists cover_letter;
alter table upwork_applications drop column if exists question_answers;
alter table upwork_applications drop column if exists profile_id;

-- ============================================================================
-- 3. Strict application status
-- ============================================================================
alter table upwork_applications drop constraint if exists upwork_applications_status_check;
alter table upwork_applications add constraint upwork_applications_status_check
  check (status in ('submitted','archived'));

-- ============================================================================
-- 4. Submission function no longer writes legacy columns
-- ============================================================================
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
    (organization_id, job_id, rep_id, person_profile_id, revenue_identity_id,
     submitted_at, proposal_text, proposal_version_id, connects_spent, boost_connects, screening_answers, status)
  values
    (p_org_id, p_job_id, p_rep_id, p_person_profile_id, p_revenue_identity_id,
     now(), p_proposal_text, v_version_id, p_connects_spent, coalesce(p_boost_connects, 0), coalesce(p_screening_answers, '[]'::jsonb), 'submitted')
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

comment on table upwork_applications is
  'Canonical submitted-application authority. Legacy columns removed at V5.1 contract.';

commit;
