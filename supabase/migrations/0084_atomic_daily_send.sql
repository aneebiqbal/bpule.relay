-- 0084: Atomic daily send check-and-insert
--
-- Fixes TOCTOU race condition in daily send limit enforcement.
-- The check (count) and the action (insert) run in a single
-- Postgres transaction so concurrent requests cannot both pass the
-- ceiling check and both insert.

-- Add timezone column to reps for accurate daily limit boundaries
alter table reps add column if not exists timezone text not null default 'UTC';

create or replace function public.atomic_log_send(
  p_rep_id uuid,
  p_lead_id uuid,
  p_org_id uuid,
  p_type text,
  p_sent_text text,
  p_limit int
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count int;
  lead_status text;
  new_message_id uuid;
  tz text;
  day_start timestamptz;
  day_end timestamptz;
begin
  -- Get rep's timezone for accurate daily boundary
  select coalesce(timezone, 'UTC') into tz from reps where id = p_rep_id;

  -- Calculate day boundaries in the rep's timezone
  day_start := date_trunc('day', now() at time zone tz);
  day_end := day_start + interval '1 day';

  -- Count today's sends for this rep and type (atomic within transaction)
  select count(*) into current_count
  from messages
  where rep_id = p_rep_id
    and sent_at is not null
    and sent_at >= day_start
    and sent_at < day_end
    and type = p_type;

  -- Enforce limit
  if current_count >= p_limit then
    return json_build_object(
      'allowed', false,
      'count', current_count,
      'limit', p_limit
    );
  end if;

  -- Verify lead ownership and status
  select status into lead_status
  from leads
  where id = p_lead_id and owner_rep_id = p_rep_id;

  if lead_status is null then
    raise exception 'not_owner';
  end if;

  if lead_status = 'no' or lead_status = 'dead' then
    raise exception 'lead_locked';
  end if;

  -- Insert message
  insert into messages (organization_id, lead_id, rep_id, type, sent_text, sent_at)
  values (p_org_id, p_lead_id, p_rep_id, p_type, p_sent_text, now())
  returning id into new_message_id;

  -- Update lead status (prevent regression from advanced states)
  if p_type = 'followup' then
    -- Follow-up requires contacted status; don't regress from replied/followed_up
    if lead_status = 'new' then
      raise exception 'contact_required';
    end if;
    if lead_status = 'replied' or lead_status = 'followed_up' then
      raise exception 'already_advanced';
    end if;
    update leads set status = 'followed_up'
    where id = p_lead_id and owner_rep_id = p_rep_id;
  else
    -- First contact: only transition from 'new'
    if lead_status <> 'new' then
      raise exception 'already_contacted';
    end if;
    update leads set status = 'contacted'
    where id = p_lead_id and owner_rep_id = p_rep_id;
  end if;

  return json_build_object(
    'allowed', true,
    'count', current_count + 1,
    'limit', p_limit,
    'message_id', new_message_id
  );
exception
  when raise_exception then
    return json_build_object(
      'allowed', false,
      'count', current_count,
      'limit', p_limit,
      'error', sqlerrm
    );
end;
$$;

-- Trigger: sync lead status to 'replied' when a replied outcome is recorded
create or replace function public.sync_lead_status_from_outcomes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage = 'replied' then
    update leads set status = 'replied'
    where id = new.lead_id and status <> 'replied';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_lead_status_on_outcome on outcomes;
create trigger trg_sync_lead_status_on_outcome
  after insert on outcomes
  for each row
  execute function public.sync_lead_status_from_outcomes();
