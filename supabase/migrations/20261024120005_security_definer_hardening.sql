-- Phase 20 — SECURITY DEFINER hardening.
--
-- `append_sample_event` and `approve_sample_for_training` were callable by any
-- authenticated user through PostgREST with no organisation or reviewer check.
-- Neither is used by the app (the dataset service writes directly), but they
-- must not stay open. Both now verify the sample belongs to the caller's org;
-- training approval additionally requires an org admin.

create or replace function public.append_sample_event(
  p_sample_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_actor uuid default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  event_id uuid;
begin
  if not exists (
    select 1 from intelligence_samples s
    where s.id = p_sample_id and s.organization_id = current_org_id()
  ) then
    raise exception 'sample not found in the caller organisation';
  end if;

  if p_idempotency_key is not null then
    select id into event_id
      from intelligence_sample_events
      where idempotency_key = p_idempotency_key;

    if event_id is not null then
      return event_id;
    end if;
  end if;

  insert into intelligence_sample_events (sample_id, event_type, payload, actor, idempotency_key)
  values (p_sample_id, p_event_type, p_payload, p_actor, p_idempotency_key)
  returning id into event_id;

  return event_id;
end;
$$;

create or replace function public.approve_sample_for_training(
  p_sample_id uuid,
  p_approver_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_org_admin() then
    raise exception 'organisation admin required';
  end if;
  if not exists (
    select 1 from intelligence_samples s
    where s.id = p_sample_id and s.organization_id = current_org_id()
  ) then
    raise exception 'sample not found in the caller organisation';
  end if;

  update intelligence_samples
  set training_approved = true,
      approved_by = p_approver_id,
      approved_at = now(),
      label_status = 'HUMAN_REVIEWED',
      review_status = 'approved',
      reviewed_by = p_approver_id,
      reviewed_at = now()
  where id = p_sample_id;
end;
$$;
