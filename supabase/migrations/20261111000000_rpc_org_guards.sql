-- RPC org guards — SECURITY DEFINER functions must not trust caller-supplied ids.
--
-- Both functions are reachable from authenticated requests. Before this
-- migration they accepted any rep/identity/job id and wrote rows for the
-- caller-supplied p_org_id, so a signed-in rep could write another org's
-- accountability rows, and an admin could attribute a submission to a foreign
-- rep. Every referenced resource is now verified against p_org_id.

-- ---------------------------------------------------------------------------
-- submit_upwork_application
-- ---------------------------------------------------------------------------
drop function if exists public.submit_upwork_application(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, integer, integer
);

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
  -- Org boundary: the job, the acting rep and the identity must all belong to
  -- p_org_id. A foreign id is indistinguishable from a missing one.
  if not exists (select 1 from upwork_jobs where id = p_job_id and organization_id = p_org_id) then
    raise exception 'JOB_NOT_FOUND';
  end if;
  if not exists (select 1 from reps where id = p_rep_id and organization_id = p_org_id) then
    raise exception 'REP_NOT_FOUND';
  end if;
  if p_revenue_identity_id is not null
     and not exists (select 1 from revenue_identities where id = p_revenue_identity_id and organization_id = p_org_id) then
    raise exception 'IDENTITY_NOT_FOUND';
  end if;
  if p_person_profile_id is not null
     and not exists (select 1 from profiles where id = p_person_profile_id and organization_id = p_org_id) then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

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

revoke execute on function public.submit_upwork_application(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, integer, integer
) from public;
grant execute on function public.submit_upwork_application(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, integer, integer
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- record_activity_event
-- ---------------------------------------------------------------------------
drop function if exists public.record_activity_event(uuid, uuid, text, uuid, text);

create or replace function public.record_activity_event(
  p_rep_id uuid,
  p_identity_id uuid,
  p_activity_type text,
  p_org_id uuid,
  p_source_event_id text default null,
  p_date date default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
  v_target_count int;
  v_completed int;
  v_status text;
  v_existing_id uuid;
  v_is_working boolean;
  v_already_recorded boolean;
begin
  -- Org boundary: the rep and the identity must belong to p_org_id.
  if not exists (select 1 from reps where id = p_rep_id and organization_id = p_org_id) then
    raise exception 'REP_NOT_FOUND';
  end if;
  if p_identity_id is not null
     and not exists (select 1 from revenue_identities where id = p_identity_id and organization_id = p_org_id) then
    raise exception 'IDENTITY_NOT_FOUND';
  end if;

  v_date := coalesce(p_date, current_date);

  -- Exactly-once: if caller supplied a source_event_id and this
  -- accountability row already contains it, return the current state
  -- without incrementing.
  if p_source_event_id is not null then
    select source_event_ids @> array[p_source_event_id]
    into v_already_recorded
    from daily_accountability
    where rep_id = p_rep_id
      and revenue_identity_id = p_identity_id
      and activity_type = p_activity_type
      and target_date = v_date
    limit 1;

    if v_already_recorded then
      select completed_count, target_count
      into v_completed, v_target_count
      from daily_accountability
      where rep_id = p_rep_id
        and revenue_identity_id = p_identity_id
        and activity_type = p_activity_type
        and target_date = v_date
      limit 1;
      return json_build_object(
        'recorded', false,
        'reason', 'already_recorded',
        'completed_count', coalesce(v_completed, 0),
        'target_count', coalesce(v_target_count, 0)
      );
    end if;
  end if;

  v_is_working := public.is_org_working_day(p_org_id, v_date);

  if not v_is_working then
    return json_build_object('recorded', false, 'reason', 'not_working_day');
  end if;

  select coalesce(
    (select target_count from daily_targets
     where rep_id = p_rep_id
       and revenue_identity_id = p_identity_id
       and activity_type = p_activity_type
       and active = true
     limit 1),
    0
  ) into v_target_count;

  insert into daily_accountability (
    organization_id, rep_id, revenue_identity_id, activity_type,
    target_date, target_count, completed_count, status, closed, source_event_ids
  ) values (
    p_org_id, p_rep_id, p_identity_id, p_activity_type,
    v_date, v_target_count, 1, 'on_track', false,
    case when p_source_event_id is not null
         then array[p_source_event_id]
         else '{}'::text[] end
  )
  on conflict (rep_id, revenue_identity_id, activity_type, target_date)
  do update set
    completed_count = daily_accountability.completed_count + 1,
    source_event_ids = case
      when p_source_event_id is not null
           and not (daily_accountability.source_event_ids @> array[p_source_event_id])
      then array_append(daily_accountability.source_event_ids, p_source_event_id)
      else daily_accountability.source_event_ids
    end,
    updated_at = now()
  where daily_accountability.closed = false
  returning id, completed_count, target_count into v_existing_id, v_completed, v_target_count;

  if v_completed >= v_target_count and v_target_count > 0 then
    v_status := 'completed';
  else
    v_status := 'on_track';
  end if;

  update daily_accountability set status = v_status where id = v_existing_id;

  return json_build_object(
    'recorded', true,
    'completed_count', v_completed,
    'target_count', v_target_count,
    'status', v_status
  );
end;
$$;

revoke execute on function public.record_activity_event(uuid, uuid, text, uuid, text, date) from public;
grant execute on function public.record_activity_event(uuid, uuid, text, uuid, text, date) to authenticated, service_role;
