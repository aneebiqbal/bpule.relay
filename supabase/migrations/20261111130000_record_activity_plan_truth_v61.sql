-- RELAY V6.1 — Completion reads the CHANNEL plan, not a per-rep target.
--
-- The RPC is the ONE completion authority. It used to resolve the requirement
-- from daily_targets (rep_id, identity, activity), which made a shared profile
-- a per-operator requirement. It now resolves it from daily_target_plans
-- (identity, activity, effective window) and records the rep's contribution in
-- daily_accountability exactly as before.
--
-- Behaviour is unchanged for solo profiles: the backfilled plans carry the same
-- target_count values. It changes only WHO owns the requirement.

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

  -- The requirement belongs to the CHANNEL. Every operator on that identity
  -- reads the same plan; daily_accountability records who contributed.
  select coalesce(
    (select target_count from daily_target_plans
     where organization_id = p_org_id
       and revenue_identity_id = p_identity_id
       and activity_type = p_activity_type
       and active = true
       and targetable = true
       and effective_from <= v_date
       and (effective_until is null or effective_until >= v_date)
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
    target_count = excluded.target_count,
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
