-- ============================================================================
-- SECURITY DEFINER surface: guard the callers.
--
-- Function EXECUTE defaults to PUBLIC in Postgres, so every function in
-- `public` was callable by the anonymous key unless it was revoked explicitly.
-- Most are pure helpers, but two are SECURITY DEFINER and act on a caller
-- supplied organization or lead:
--
--   * atomic_log_send writes a message and moves a lead's status for an
--     arbitrary p_rep_id / p_org_id. The lead-ownership check stopped a caller
--     from touching a lead owned by someone else, but it did not stop a rep
--     from attributing a send to another rep in the same organization.
--   * next_sample_version reads the sample version for an arbitrary lead with
--     no organization check at all.
--
-- This migration guards both and narrows EXECUTE on every `public` function to
-- the application roles. Triggers execute as the table owner and are unaffected
-- by EXECUTE grants; RLS policies run as the calling role and now have EXECUTE
-- through `authenticated` (and `relay_app`, which is a member of it).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. atomic_log_send — caller may act only for their own organization and,
--    unless they are an admin, only for themself.
-- ---------------------------------------------------------------------------

create or replace function public.atomic_log_send(
  p_rep_id uuid,
  p_lead_id uuid,
  p_org_id uuid,
  p_type text,
  p_sent_text text,
  p_limit integer
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_count int;
  lead_status text;
  new_message_id uuid;
  tz text;
  day_start timestamptz;
  day_end timestamptz;
begin
  -- guard: the caller may only act inside their own organization, and only
  -- for themself unless they are an organization admin.
  if p_org_id is null or p_org_id <> public.current_org_id() then
    return json_build_object('allowed', false, 'error', 'cross_org');
  end if;
  if p_rep_id <> public.current_rep_id() and not public.is_org_admin() then
    return json_build_object('allowed', false, 'error', 'not_allowed');
  end if;

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
    if lead_status = 'new' then
      raise exception 'contact_required';
    end if;
    if lead_status = 'replied' or lead_status = 'followed_up' then
      raise exception 'already_advanced';
    end if;
    update leads set status = 'followed_up'
    where id = p_lead_id and owner_rep_id = p_rep_id;
  else
    if lead_status <> 'new' then
      raise exception 'already_contacted';
    end if;
    update leads set status = 'contacted'
    where id = p_lead_id and owner_rep_id = p_rep_id;
  end if;

  return json_build_object(
    'allowed', true,
    'count', current_count + 1,
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
$function$;

-- ---------------------------------------------------------------------------
-- 2. next_sample_version — the lead must belong to the caller's organization.
-- ---------------------------------------------------------------------------

create or replace function public.next_sample_version(p_lead_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_max integer;
begin
  if not exists (
    select 1
    from intelligence_samples
    where lead_id = p_lead_id
      and organization_id = current_org_id()
  ) then
    raise exception 'lead not found in the caller organisation';
  end if;

  select coalesce(max(version), 0) into current_max
  from intelligence_samples
  where lead_id = p_lead_id;
  return current_max + 1;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Narrow EXECUTE on every public function to the application roles.
-- ---------------------------------------------------------------------------

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   select count(*) from information_schema.routine_privileges
--   where routine_schema='public' and grantee in ('PUBLIC','anon');  -- expect 0
-- ---------------------------------------------------------------------------
