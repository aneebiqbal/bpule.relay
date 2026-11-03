-- Close the anonymous-key exposure found in the production schema dump of
-- 2026-11-01 (docs/RELAY_SECURITY_ANON_EXPOSURE_AUDIT.md).
--
-- 1. Seven tables that production received from 0088_fix_missing_tables.sql
--    without row level security, so the public anon key could read and write
--    them: relay_events, relay_runs, revenue_identities, identity_assignments,
--    accountability_audit_log, activity_log, style_cards. The policies 0081,
--    0085 and 0086 meant them to have never ran there. notifications, the
--    eighth, is reshaped and closed by 20261101135000 and re-asserted here.
-- 2. SECURITY DEFINER functions that act on a caller-supplied organization or
--    person without checking it against the caller, all executable by anon.
-- 3. signal_events' insert policy, which accepts any row from any role.
--
-- Scope follows the Phase 8 permission model (docs/RELAY_OPERATIONS_WORKSPACE_V2.md):
-- rep → own, manager → managed team + self, admin/owner → organization. The
-- service role bypasses RLS and passes every function guard.
--
-- Applied on its own (before 20261101120000), admin means reps.role = 'admin'
-- and can_see_rep() falls back to self-or-admin; 20261101120000 widens both to
-- organization_roles and manager scope, and these policies pick that up.
--
-- Idempotent. Policies use (select fn()) so a helper runs once per statement,
-- not once per row.

-- ============================================================================
-- 0. Helpers
-- ============================================================================

-- True when PostgREST is acting with the service-role key.
create or replace function public.request_is_service_role() returns boolean
language sql stable set search_path = public as
$$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  ) is not distinct from 'service_role';
$$;

-- Manager-aware visibility is defined by 20261101120000; until it runs, self or admin.
do $$
begin
  if to_regprocedure('public.can_see_rep(uuid)') is null then
    execute $f$
      create function public.can_see_rep(target_rep_id uuid) returns boolean
      language sql stable security definer set search_path = public as
      $b$ select target_rep_id is not null
                 and (target_rep_id = public.current_rep_id() or public.is_org_admin()) $b$
    $f$;
  end if;
end $$;

-- A function may act for p_org_id (and p_person_id, when given) only for the
-- caller's own organization, and only for the caller themself unless the
-- caller is an org admin and the person belongs to that organization.
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

-- ============================================================================
-- 1. Tables
-- ============================================================================

-- notifications: 20261101135000 owns the policies; never leave it open.
alter table notifications enable row level security;
revoke all on notifications from anon;

-- relay_runs: visible with the work it belongs to — the assigned rep's scope, or
-- a lead the caller can already see (the subquery is RLS-filtered). Writes go
-- through create_relay_run / transition_relay_run or the service role.
alter table relay_runs enable row level security;
revoke all on relay_runs from anon;
drop policy if exists "rr_select" on relay_runs;
drop policy if exists "rr_insert" on relay_runs;
drop policy if exists "rr_update" on relay_runs;
create policy "rr_select" on relay_runs for select to authenticated using (
  organization_id = (select public.current_org_id())
  and (
    (select public.is_org_admin())
    or public.can_see_rep(assigned_rep_id)
    or (primary_entity_type = 'lead'
        and exists (select 1 from leads l where l.id = relay_runs.primary_entity_id))
  )
);

-- relay_events: payloads can carry lead and message context. Admins see the
-- organization; others see their own actions and events of runs or leads they
-- can see. Inserts go through emit_relay_event or the service role only.
alter table relay_events enable row level security;
revoke all on relay_events from anon;
drop policy if exists "re_select" on relay_events;
create policy "re_select" on relay_events for select to authenticated using (
  organization_id = (select public.current_org_id())
  and (
    (select public.is_org_admin())
    or actor_id = (select public.current_rep_id())
    or actor_rep_id = (select public.current_rep_id())
    or (relay_run_id is not null
        and exists (select 1 from relay_runs r where r.id = relay_events.relay_run_id))
    or (entity_type = 'lead' and entity_id is not null
        and exists (select 1 from leads l where l.id = relay_events.entity_id))
  )
);

-- revenue_identities: organization configuration (sender personas) that every
-- role's filters and workspaces name. Read in-org; only admins change it.
alter table revenue_identities enable row level security;
revoke all on revenue_identities from anon;
drop policy if exists "rev_id_select" on revenue_identities;
drop policy if exists "rev_id_insert" on revenue_identities;
drop policy if exists "rev_id_update" on revenue_identities;
drop policy if exists "rev_id_delete" on revenue_identities;
create policy "rev_id_select" on revenue_identities for select to authenticated
  using (organization_id = (select public.current_org_id()));
create policy "rev_id_insert" on revenue_identities for insert to authenticated
  with check (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));
create policy "rev_id_update" on revenue_identities for update to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()))
  with check (organization_id = (select public.current_org_id()));
create policy "rev_id_delete" on revenue_identities for delete to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

-- identity_assignments: who may send as which identity. Rep → own, manager →
-- team, admin → organization. Admins assign (the assign route upserts, so it
-- needs the update policy too).
alter table identity_assignments enable row level security;
revoke all on identity_assignments from anon;
drop policy if exists "ia_select" on identity_assignments;
drop policy if exists "ia_insert" on identity_assignments;
drop policy if exists "ia_update" on identity_assignments;
drop policy if exists "ia_delete" on identity_assignments;
create policy "ia_select" on identity_assignments for select to authenticated
  using (organization_id = (select public.current_org_id()) and public.can_see_rep(rep_id));
create policy "ia_insert" on identity_assignments for insert to authenticated
  with check (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));
create policy "ia_update" on identity_assignments for update to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()))
  with check (organization_id = (select public.current_org_id()));
create policy "ia_delete" on identity_assignments for delete to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

-- accountability_audit_log: append-only and attributable. Admins read the
-- organization's trail, a rep reads their own entries; a row can only be
-- written as the caller. No update or delete policy.
alter table accountability_audit_log enable row level security;
revoke all on accountability_audit_log from anon;
drop policy if exists "aal_select" on accountability_audit_log;
drop policy if exists "aal_insert" on accountability_audit_log;
create policy "aal_select" on accountability_audit_log for select to authenticated using (
  organization_id = (select public.current_org_id())
  and ((select public.is_org_admin()) or actor_id = (select public.current_rep_id()))
);
create policy "aal_insert" on accountability_audit_log for insert to authenticated with check (
  organization_id = (select public.current_org_id()) and actor_id = (select public.current_rep_id())
);

-- activity_log: no app reader today. Same shape as the audit log.
alter table activity_log enable row level security;
revoke all on activity_log from anon;
drop policy if exists "al_select" on activity_log;
drop policy if exists "al_insert" on activity_log;
create policy "al_select" on activity_log for select to authenticated using (
  organization_id = (select public.current_org_id())
  and ((select public.is_org_admin()) or actor_id = (select public.current_rep_id()))
);
create policy "al_insert" on activity_log for insert to authenticated with check (
  organization_id = (select public.current_org_id()) and actor_id = (select public.current_rep_id())
);

-- style_cards: a rep's calibrated writing style, derived from their own samples.
-- The rep manages their own; admins may read.
alter table style_cards enable row level security;
revoke all on style_cards from anon;
drop policy if exists "style_cards_select" on style_cards;
drop policy if exists "style_cards_write" on style_cards;
create policy "style_cards_select" on style_cards for select to authenticated using (
  organization_id = (select public.current_org_id())
  and (rep_id = (select public.current_rep_id()) or (select public.is_org_admin()))
);
create policy "style_cards_write" on style_cards for all to authenticated
  using (organization_id = (select public.current_org_id()) and rep_id = (select public.current_rep_id()))
  with check (organization_id = (select public.current_org_id()) and rep_id = (select public.current_rep_id()));

-- signal_events: the "insertable by service role" policy had no role and
-- WITH CHECK (true), so anon could insert into any organization. The service
-- role bypasses RLS and never needed it; signal-watch inserts as the user.
revoke all on signal_events from anon;
drop policy if exists "Signal events insertable by service role" on signal_events;
drop policy if exists "signal_events_insert" on signal_events;
create policy "signal_events_insert" on signal_events for insert to authenticated
  with check (organization_id = (select public.current_org_id()));

-- ============================================================================
-- 2. SECURITY DEFINER functions: guard the caller
-- ============================================================================
-- Bodies are production's, verbatim from the 2026-11-01 schema dump. The only
-- changes are the marked guard block and, where 20261101150000 pinned it, the
-- search_path (CREATE OR REPLACE would otherwise reset it).

CREATE OR REPLACE FUNCTION "public"."ensure_day_close"("p_org_id" "uuid", "p_person_id" "uuid", "p_revenue_identity_id" "uuid", "p_date" "date" DEFAULT CURRENT_DATE) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_contract_id uuid;
  v_allocation_pct int;
  v_availability text;
  v_existing_id uuid;
  v_status text;
begin
  -- guard (20261101160000): only the caller's organization, and only themself unless admin
  if not public.caller_may_act_for(p_org_id, p_person_id) then
    raise exception 'ensure_day_close: caller may not act for this organization or person' using errcode = '42501';
  end if;
  -- Check availability: skip if not working
  select status into v_availability
  from operator_availability
  where person_id = p_person_id and date = p_date;

  if v_availability is not null and v_availability != 'working' then
    return null;
  end if;

  -- Find active contract for this identity
  select id into v_contract_id
  from revenue_identity_contracts
  where revenue_identity_id = p_revenue_identity_id
    and status = 'active'
    and effective_from <= p_date
    and (effective_to is null or effective_to >= p_date)
  order by effective_from desc
  limit 1;

  if v_contract_id is null then
    return null;
  end if;

  -- Find allocation for this person
  select allocation_pct into v_allocation_pct
  from contract_allocations
  where contract_id = v_contract_id and person_id = p_person_id;

  -- If no allocation row and there are allocations, skip (not assigned)
  if v_allocation_pct is null and exists (
    select 1 from contract_allocations where contract_id = v_contract_id
  ) then
    return null;
  end if;

  -- Check for existing day_close (idempotent)
  select id, status into v_existing_id, v_status
  from day_closes
  where person_id = p_person_id
    and revenue_identity_id = p_revenue_identity_id
    and date = p_date;

  if v_existing_id is not null then
    -- Already exists — never mutate historical closed days
    return v_existing_id;
  end if;

  -- Create day_close
  insert into day_closes (
    organization_id, person_id, revenue_identity_id, contract_id,
    date, status, completion_snapshot
  ) values (
    p_org_id, p_person_id, p_revenue_identity_id, v_contract_id,
    p_date, 'not_started', '{}'::jsonb
  )
  on conflict (person_id, revenue_identity_id, date) do nothing
  returning id into v_existing_id;

  return v_existing_id;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."ensure_day_closes_for_person"("p_org_id" "uuid", "p_person_id" "uuid", "p_date" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("identity_id" "uuid", "day_close_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_identity_id uuid;
  v_dc_id uuid;
begin
  -- guard (20261101160000): only the caller's organization, and only themself unless admin
  if not public.caller_may_act_for(p_org_id, p_person_id) then
    raise exception 'ensure_day_closes_for_person: caller may not act for this organization or person' using errcode = '42501';
  end if;
  for v_identity_id in
    select distinct ia.revenue_identity_id
    from identity_assignments ia
    where ia.rep_id = p_person_id
      and ia.organization_id = p_org_id
  loop
    v_dc_id := ensure_day_close(p_org_id, p_person_id, v_identity_id, p_date);
    identity_id := v_identity_id;
    day_close_id := v_dc_id;
    return next;
  end loop;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."record_activity_event"("p_rep_id" "uuid", "p_identity_id" "uuid", "p_activity_type" "text", "p_org_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_date date;
  v_target_count int;
  v_completed int;
  v_status text;
  v_existing_id uuid;
  v_is_working boolean;
begin
  -- guard (20261101160000): only the caller's organization, and only themself unless admin
  if not public.caller_may_act_for(p_org_id, p_rep_id) then
    raise exception 'record_activity_event: caller may not act for this organization or person' using errcode = '42501';
  end if;
  v_date := current_date;
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
    target_date, target_count, completed_count, status, closed
  ) values (
    p_org_id, p_rep_id, p_identity_id, p_activity_type,
    v_date, v_target_count, 1, 'on_track', false
  )
  on conflict (rep_id, revenue_identity_id, activity_type, target_date)
  do update set
    completed_count = daily_accountability.completed_count + 1,
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

CREATE OR REPLACE FUNCTION "public"."record_activity_event"("p_rep_id" "uuid", "p_identity_id" "uuid", "p_activity_type" "text", "p_org_id" "uuid", "p_source_event_id" "text" DEFAULT NULL::"text", "p_date" "date" DEFAULT NULL::"date") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_date date;
  v_target_count int;
  v_completed int;
  v_status text;
  v_existing_id uuid;
  v_is_working boolean;
  v_already_recorded boolean;
begin
  -- guard (20261101160000): only the caller's organization, and only themself unless admin
  if not public.caller_may_act_for(p_org_id, p_rep_id) then
    raise exception 'record_activity_event: caller may not act for this organization or person' using errcode = '42501';
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

CREATE OR REPLACE FUNCTION "public"."record_canonical_progress"("p_org_id" "uuid", "p_person_id" "uuid", "p_revenue_identity_id" "uuid", "p_event_type" "text", "p_metric_key" "text", "p_source_event_id" "text", "p_date" "date" DEFAULT CURRENT_DATE) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_day_close_id uuid;
  v_existing_event_ids text[];
  v_new_count int;
  v_current_snapshot jsonb;
begin
  -- guard (20261101160000): only the caller's organization, and only themself unless admin
  if not public.caller_may_act_for(p_org_id, p_person_id) then
    raise exception 'record_canonical_progress: caller may not act for this organization or person' using errcode = '42501';
  end if;
  -- Find the day_close for this person + identity + date
  select id, source_event_ids, completion_snapshot
  into v_day_close_id, v_existing_event_ids, v_current_snapshot
  from day_closes
  where organization_id = p_org_id
    and person_id = p_person_id
    and revenue_identity_id = p_revenue_identity_id
    and date = p_date;

  -- No day_close → nothing to record against
  if v_day_close_id is null then
    return null;
  end if;

  -- Already closed → don't modify immutable history
  if exists (
    select 1 from day_closes
    where id = v_day_close_id
      and status in ('completed', 'completed_with_exception', 'missed')
  ) then
    return null;
  end if;

  -- Exactly-once: skip if this source event was already counted
  if p_source_event_id is not null and v_existing_event_ids @> array[p_source_event_id] then
    return v_day_close_id;
  end if;

  -- Increment the metric
  v_new_count := coalesce((v_current_snapshot ->> p.metric_key)::int, 0) + 1;

  -- Update snapshot and source event tracking atomically
  update day_closes
  set
    completion_snapshot = jsonb_set(
      completion_snapshot,
      array[p_metric_key],
      to_jsonb(v_new_count)
    ),
    source_event_ids = case
      when p_source_event_id is not null
      then array_append(source_event_ids, p_source_event_id)
      else source_event_ids
    end,
    status = case
      when status = 'not_started' then 'in_progress'
      else status
    end,
    updated_at = now()
  where id = v_day_close_id;

  return v_day_close_id;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."transition_relay_run"("p_run_id" "uuid", "p_org_id" "uuid", "p_new_status" "text", "p_new_step" "text" DEFAULT NULL::"text", "p_event_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_run record;
  v_valid_transitions jsonb;
  v_next_step text;
begin
  -- guard (20261101160000): only the caller's organization, and only themself unless admin
  if not public.caller_may_act_for(p_org_id, null) then
    raise exception 'transition_relay_run: caller may not act for this organization or person' using errcode = '42501';
  end if;
  select * into v_run from relay_runs where id = p_run_id and organization_id = p_org_id;
  if not found then
    raise exception 'transition_relay_run: run not found';
  end if;

  v_valid_transitions := '{
    "detected": ["qualifying", "rejected", "cancelled"],
    "qualifying": ["qualified", "rejected", "cancelled"],
    "qualified": ["routing", "preparing", "cancelled"],
    "routing": ["preparing", "cancelled"],
    "preparing": ["awaiting_human", "cancelled"],
    "awaiting_human": ["action_recorded", "cancelled"],
    "action_recorded": ["waiting", "cancelled"],
    "waiting": ["followup_due", "response_received", "conversation", "cancelled"],
    "followup_due": ["followup_preparing", "cancelled"],
    "followup_preparing": ["awaiting_human", "cancelled"],
    "response_received": ["conversation", "cancelled"],
    "conversation": ["completed", "cancelled"],
    "rejected": [],
    "completed": [],
    "failed": [],
    "cancelled": []
  }'::jsonb;

  if not (v_valid_transitions -> v_run.status ? p_new_status) then
    raise exception 'transition_relay_run: invalid transition from % to %', v_run.status, p_new_status;
  end if;

  v_next_step := coalesce(p_new_step, p_new_status);

  update relay_runs set
    status = p_new_status,
    current_step = v_next_step,
    metadata = metadata || p_metadata,
    updated_at = now(),
    completed_at = case when p_new_status in ('completed', 'rejected') then now() else completed_at end,
    failed_at = case when p_new_status = 'failed' then now() else failed_at end
  where id = p_run_id and organization_id = p_org_id;

  return json_build_object(
    'run_id', p_run_id,
    'previous_status', v_run.status,
    'new_status', p_new_status,
    'step', v_next_step
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_run_events"("p_run_id" "uuid", "p_org_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_run_org uuid;
begin
  -- guard (20261101160000): only the caller's organization, and only themself unless admin
  if not public.caller_may_act_for(p_org_id, null) then
    raise exception 'get_run_events: caller may not act for this organization or person' using errcode = '42501';
  end if;
  select organization_id into v_run_org from relay_runs where id = p_run_id;
  if v_run_org is null or v_run_org != p_org_id then
    raise exception 'get_run_events: run not found or cross-org denied';
  end if;

  return (
    select json_agg(e order by e.occurred_at)
    from relay_events e
    where e.relay_run_id = p_run_id
  );
end;
$$;

-- ============================================================================
-- 3. Execute grants
-- ============================================================================

-- Nothing here is for the anonymous key.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'ensure_day_close', 'ensure_day_closes_for_person', 'get_run_events',
        'record_activity_event', 'record_canonical_progress', 'transition_relay_run',
        'create_relay_run', 'emit_relay_event', 'is_org_working_day', 'refresh_few_shot_wins',
        'caller_may_act_for', 'request_is_service_role'
      ])
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- The no-argument refresh recomputes every organization: service role only.
revoke all on function public.refresh_few_shot_wins() from authenticated;
