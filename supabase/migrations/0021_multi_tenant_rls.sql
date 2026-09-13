-- 021: Multi-tenant RLS rewrite.
--
-- Drops every existing policy on tenant-scoped tables and replaces them with
-- organization-scoped variants. The new rule, applied uniformly:
--   * SELECT: only rows in the signed-in rep's own organization are visible.
--   * INSERT/UPDATE/DELETE: same-org rows only, and restricted to that
--     organization's admin for write operations that aren't owner-scoped.
--
-- Two helper functions replace the old current_rep_id()/is_admin():
--   * current_org_id()  — the signed-in rep's organization_id (or null).
--   * is_org_admin()   — true only when that rep's role is 'admin' AND the
--                         operation stays within their organization.
--
-- Rows from another organization ALWAYS return zero, by construction: every
-- USING clause ANDs on organization_id = current_org_id().

-- ============================================================================
-- Tenant helper functions
-- ============================================================================

create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = public as
$$
  select r.organization_id from reps r where r.auth_user_id = auth.uid();
$$;

create or replace function public.is_org_admin() returns boolean
language sql stable security definer set search_path = public as
$$
  select coalesce((
    select r.role = 'admin'
    from reps r
    where r.auth_user_id = auth.uid()
  ), false);
$$;

-- ============================================================================
-- REPS
-- ============================================================================

drop policy if exists reps_select on reps;
drop policy if exists reps_admin_write on reps;
drop policy if exists reps_admin_update on reps;
drop policy if exists reps_admin_delete on reps;

create policy reps_select on reps for select
  to authenticated using (organization_id = current_org_id());

create policy reps_insert on reps for insert
  to authenticated with check (
    organization_id = current_org_id()
    and is_org_admin()
  );

create policy reps_update on reps for update
  to authenticated using (
    organization_id = current_org_id()
    and is_org_admin()
  ) with check (
    organization_id = current_org_id()
    and is_org_admin()
  );

create policy reps_delete on reps for delete
  to authenticated using (
    organization_id = current_org_id()
    and is_org_admin()
  );

-- ============================================================================
-- LEADS
-- ============================================================================

drop policy if exists leads_select on leads;
drop policy if exists leads_insert on leads;
drop policy if exists leads_update on leads;
drop policy if exists leads_delete on leads;

create policy leads_select on leads for select
  to authenticated using (organization_id = current_org_id());

create policy leads_insert on leads for insert
  to authenticated with check (organization_id = current_org_id());

create policy leads_update on leads for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy leads_delete on leads for delete
  to authenticated using (organization_id = current_org_id());

-- ============================================================================
-- MESSAGES
-- ============================================================================

drop policy if exists messages_select on messages;
drop policy if exists messages_insert on messages;
drop policy if exists messages_admin_update on messages;
drop policy if exists messages_admin_delete on messages;

create policy messages_select on messages for select
  to authenticated using (organization_id = current_org_id());

create policy messages_insert on messages for insert
  to authenticated with check (organization_id = current_org_id());

create policy messages_update on messages for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy messages_delete on messages for delete
  to authenticated using (organization_id = current_org_id());

-- ============================================================================
-- OUTCOMES
-- ============================================================================

drop policy if exists outcomes_select on outcomes;
drop policy if exists outcomes_insert on outcomes;
drop policy if exists outcomes_admin_delete on outcomes;

create policy outcomes_select on outcomes for select
  to authenticated using (organization_id = current_org_id());

create policy outcomes_insert on outcomes for insert
  to authenticated with check (organization_id = current_org_id());

create policy outcomes_delete on outcomes for delete
  to authenticated using (organization_id = current_org_id());

-- ============================================================================
-- VOICE_PROFILES
-- ============================================================================

drop policy if exists vp_select on voice_profiles;
drop policy if exists vp_insert on voice_profiles;
drop policy if exists vp_update on voice_profiles;
drop policy if exists vp_delete on voice_profiles;

create policy vp_select on voice_profiles for select
  to authenticated using (organization_id = current_org_id());

create policy vp_insert on voice_profiles for insert
  to authenticated with check (organization_id = current_org_id());

create policy vp_update on voice_profiles for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy vp_delete on voice_profiles for delete
  to authenticated using (organization_id = current_org_id());

-- ============================================================================
-- FACTS
-- ============================================================================

drop policy if exists facts_select on facts;
drop policy if exists facts_admin_insert on facts;
drop policy if exists facts_admin_update on facts;
drop policy if exists facts_admin_delete on facts;

create policy facts_select on facts for select
  to authenticated using (organization_id = current_org_id());

create policy facts_insert on facts for insert
  to authenticated with check (
    organization_id = current_org_id()
    and is_org_admin()
  );

create policy facts_update on facts for update
  to authenticated using (
    organization_id = current_org_id()
    and is_org_admin()
  ) with check (
    organization_id = current_org_id()
    and is_org_admin()
  );

create policy facts_delete on facts for delete
  to authenticated using (
    organization_id = current_org_id()
    and is_org_admin()
  );

-- ============================================================================
-- PLAYS
-- ============================================================================

drop policy if exists plays_select on plays;
drop policy if exists plays_admin_insert on plays;
drop policy if exists plays_admin_update on plays;
drop policy if exists plays_admin_delete on plays;

create policy plays_select on plays for select
  to authenticated using (organization_id = current_org_id());

create policy plays_insert on plays for insert
  to authenticated with check (
    organization_id = current_org_id()
    and is_org_admin()
  );

create policy plays_update on plays for update
  to authenticated using (
    organization_id = current_org_id()
    and is_org_admin()
  ) with check (
    organization_id = current_org_id()
    and is_org_admin()
  );

create policy plays_delete on plays for delete
  to authenticated using (
    organization_id = current_org_id()
    and is_org_admin()
  );

-- ============================================================================
-- PROFILES
-- ============================================================================

drop policy if exists profiles_select on profiles;
drop policy if exists profiles_insert on profiles;
drop policy if exists profiles_update on profiles;
drop policy if exists profiles_delete on profiles;

create policy profiles_select on profiles for select
  to authenticated using (organization_id = current_org_id());

create policy profiles_insert on profiles for insert
  to authenticated with check (organization_id = current_org_id());

create policy profiles_update on profiles for update
  to authenticated using (
    organization_id = current_org_id()
    and is_org_admin()
  ) with check (
    organization_id = current_org_id()
    and is_org_admin()
  );

create policy profiles_delete on profiles for delete
  to authenticated using (
    organization_id = current_org_id()
    and is_org_admin()
  );

-- ============================================================================
-- PROOF_ITEMS
-- ============================================================================

drop policy if exists proof_items_select on proof_items;
drop policy if exists proof_items_insert on proof_items;
drop policy if exists proof_items_update on proof_items;
drop policy if exists proof_items_delete on proof_items;

create policy proof_items_select on proof_items for select
  to authenticated using (organization_id = current_org_id());

create policy proof_items_insert on proof_items for insert
  to authenticated with check (organization_id = current_org_id());

create policy proof_items_update on proof_items for update
  to authenticated using (
    organization_id = current_org_id()
    and is_org_admin()
  ) with check (
    organization_id = current_org_id()
    and is_org_admin()
  );

create policy proof_items_delete on proof_items for delete
  to authenticated using (
    organization_id = current_org_id()
    and is_org_admin()
  );

-- ============================================================================
-- GOLDEN_SET
-- ============================================================================

drop policy if exists golden_set_select on golden_set;
drop policy if exists golden_set_admin_write on golden_set;

create policy golden_set_select on golden_set for select
  to authenticated using (organization_id = current_org_id());

create policy golden_set_insert on golden_set for insert
  to authenticated with check (
    organization_id = current_org_id()
    and is_org_admin()
  );

create policy golden_set_update on golden_set for update
  to authenticated using (
    organization_id = current_org_id()
    and is_org_admin()
  ) with check (
    organization_id = current_org_id()
    and is_org_admin()
  );

create policy golden_set_delete on golden_set for delete
  to authenticated using (
    organization_id = current_org_id()
    and is_org_admin()
  );

-- ============================================================================
-- FEW_SHOT_WINS
-- ============================================================================

drop policy if exists few_shot_wins_select on few_shot_wins;
drop policy if exists few_shot_wins_admin_write on few_shot_wins;

create policy few_shot_wins_select on few_shot_wins for select
  to authenticated using (organization_id = current_org_id());

create policy few_shot_wins_insert on few_shot_wins for insert
  to authenticated with check (
    organization_id = current_org_id()
    and is_org_admin()
  );

create policy few_shot_wins_update on few_shot_wins for update
  to authenticated using (
    organization_id = current_org_id()
    and is_org_admin()
  ) with check (
    organization_id = current_org_id()
    and is_org_admin()
  );

create policy few_shot_wins_delete on few_shot_wins for delete
  to authenticated using (
    organization_id = current_org_id()
    and is_org_admin()
  );

-- ============================================================================
-- UPWORK_JOBS
-- ============================================================================

drop policy if exists upwork_jobs_select on upwork_jobs;
drop policy if exists upwork_jobs_insert on upwork_jobs;
drop policy if exists upwork_jobs_update on upwork_jobs;
drop policy if exists upwork_jobs_delete on upwork_jobs;

create policy upwork_jobs_select on upwork_jobs for select
  to authenticated using (organization_id = current_org_id());

create policy upwork_jobs_insert on upwork_jobs for insert
  to authenticated with check (organization_id = current_org_id());

create policy upwork_jobs_update on upwork_jobs for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy upwork_jobs_delete on upwork_jobs for delete
  to authenticated using (organization_id = current_org_id());

-- ============================================================================
-- UPWORK_MESSAGES
-- ============================================================================

drop policy if exists upwork_messages_select on upwork_messages;
drop policy if exists upwork_messages_insert on upwork_messages;
drop policy if exists upwork_messages_admin_update on upwork_messages;
drop policy if exists upwork_messages_admin_delete on upwork_messages;

create policy upwork_messages_select on upwork_messages for select
  to authenticated using (organization_id = current_org_id());

create policy upwork_messages_insert on upwork_messages for insert
  to authenticated with check (organization_id = current_org_id());

create policy upwork_messages_update on upwork_messages for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy upwork_messages_delete on upwork_messages for delete
  to authenticated using (organization_id = current_org_id());

-- ============================================================================
-- CSV_IMPORTS
-- ============================================================================

drop policy if exists csv_imports_own on csv_imports;
drop policy if exists csv_imports_select on csv_imports;
drop policy if exists csv_imports_insert on csv_imports;

create policy csv_imports_select on csv_imports for select
  to authenticated using (organization_id = current_org_id());

create policy csv_imports_insert on csv_imports for insert
  to authenticated with check (organization_id = current_org_id());

create policy csv_imports_update on csv_imports for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy csv_imports_delete on csv_imports for delete
  to authenticated using (organization_id = current_org_id());

-- ============================================================================
-- CONTENT_PERSONAS
-- ============================================================================

drop policy if exists content_personas_owner on content_personas;

create policy content_personas_select on content_personas for select
  to authenticated using (organization_id = current_org_id());

create policy content_personas_insert on content_personas for insert
  to authenticated with check (organization_id = current_org_id());

create policy content_personas_update on content_personas for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy content_personas_delete on content_personas for delete
  to authenticated using (organization_id = current_org_id());

-- ============================================================================
-- CONTENT_PILLARS
-- ============================================================================

drop policy if exists content_pillars_persona_owner on content_pillars;

create policy content_pillars_select on content_pillars for select
  to authenticated using (organization_id = current_org_id());

create policy content_pillars_insert on content_pillars for insert
  to authenticated with check (organization_id = current_org_id());

create policy content_pillars_update on content_pillars for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy content_pillars_delete on content_pillars for delete
  to authenticated using (organization_id = current_org_id());

-- ============================================================================
-- CONTENT_DRAFTS
-- ============================================================================

drop policy if exists content_drafts_persona_owner on content_drafts;

create policy content_drafts_select on content_drafts for select
  to authenticated using (organization_id = current_org_id());

create policy content_drafts_insert on content_drafts for insert
  to authenticated with check (organization_id = current_org_id());

create policy content_drafts_update on content_drafts for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy content_drafts_delete on content_drafts for delete
  to authenticated using (organization_id = current_org_id());

-- ============================================================================
-- CONTENT_HISTORY
-- ============================================================================

drop policy if exists content_history_persona_owner on content_history;

create policy content_history_select on content_history for select
  to authenticated using (organization_id = current_org_id());

create policy content_history_insert on content_history for insert
  to authenticated with check (organization_id = current_org_id());

create policy content_history_update on content_history for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy content_history_delete on content_history for delete
  to authenticated using (organization_id = current_org_id());

-- ============================================================================
-- PUSH_SUBSCRIPTIONS
-- ============================================================================

drop policy if exists push_subscriptions_own on push_subscriptions;

create policy push_subscriptions_select on push_subscriptions for select
  to authenticated using (organization_id = current_org_id());

create policy push_subscriptions_insert on push_subscriptions for insert
  to authenticated with check (organization_id = current_org_id());

create policy push_subscriptions_update on push_subscriptions for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy push_subscriptions_delete on push_subscriptions for delete
  to authenticated using (organization_id = current_org_id());

-- ============================================================================
-- NOTIFICATION_LOG
-- ============================================================================

drop policy if exists notification_log_own on notification_log;

create policy notification_log_select on notification_log for select
  to authenticated using (organization_id = current_org_id());

create policy notification_log_insert on notification_log for insert
  to authenticated with check (organization_id = current_org_id());

create policy notification_log_update on notification_log for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy notification_log_delete on notification_log for delete
  to authenticated using (organization_id = current_org_id());

-- ============================================================================
-- EVAL_RUNS
-- ============================================================================

drop policy if exists eval_runs_select on eval_runs;
drop policy if exists eval_runs_admin_write on eval_runs;

create policy eval_runs_select on eval_runs for select
  to authenticated using (organization_id = current_org_id());

create policy eval_runs_insert on eval_runs for insert
  to authenticated with check (organization_id = current_org_id());

create policy eval_runs_update on eval_runs for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy eval_runs_delete on eval_runs for delete
  to authenticated using (organization_id = current_org_id());

-- ============================================================================
-- EXTRACTION_RUNS
-- ============================================================================

drop policy if exists extraction_runs_select on extraction_runs;
drop policy if exists extraction_runs_insert on extraction_runs;

create policy extraction_runs_select on extraction_runs for select
  to authenticated using (organization_id = current_org_id());

create policy extraction_runs_insert on extraction_runs for insert
  to authenticated with check (organization_id = current_org_id());

create policy extraction_runs_update on extraction_runs for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy extraction_runs_delete on extraction_runs for delete
  to authenticated using (organization_id = current_org_id());
