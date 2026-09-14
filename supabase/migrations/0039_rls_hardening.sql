-- 0039: RLS hardening.
--
-- Two gaps found in a production security audit:
--
-- 1. `organizations` and `organization_rulebooks` were created (0020, 0022)
--    without RLS at all. Any authenticated Postgres role could read or write
--    any organization's row, or any org's scoring rubric, via a direct
--    table query (bypassing the app layer entirely).
--
-- 2. The 0021 multi-tenant rewrite replaced every persona-owner policy
--    (`rep_id = auth.uid()`, from 0018) with an org-only check
--    (`organization_id = current_org_id()`). That widened visibility from
--    "your own personas" to "every persona in your organization" — so any
--    rep can read/write any *other* rep's personas, drafts, taste profile,
--    journey, quick captures, etc. within the same org. The adversarial RLS
--    test added in 0024 only ever checked cross-organization isolation; it
--    never caught this because it wasn't testing cross-persona isolation
--    within one org. This was never an intentional "team visibility"
--    decision the way 0017 (leads/messages/outcomes) was — that one is
--    documented and deliberate; this one is a silent regression.
--
-- Fix: restore persona ownership (rep_id = auth.uid()) as an additional
-- requirement, OR-ed with org-admin access via is_org_admin() (so admins
-- keep full visibility within their own org, consistent with 0021's model).
--
-- The app layer's existing authorization rule (checked identically across
-- every content_* API route) is `persona.repId === user.rep.id ||
-- user.rep.role === 'admin'` — org admins can act on ANY persona in their
-- org, including inserts (e.g. adding a pillar or draft to a teammate's
-- persona on their behalf). RLS must mirror that exactly: INSERT policies
-- below allow `is_org_admin()` as an alternative to owning the row, not
-- just SELECT/UPDATE/DELETE — otherwise this migration would silently break
-- the admin-on-behalf-of-teammate flows that already exist in the app.

-- ============================================================================
-- 1. ORGANIZATIONS + ORGANIZATION_RULEBOOKS — enable RLS
-- ============================================================================

alter table organizations enable row level security;

drop policy if exists organizations_select on organizations;
create policy organizations_select on organizations for select
  to authenticated using (id = current_org_id());

drop policy if exists organizations_update on organizations;
create policy organizations_update on organizations for update
  to authenticated using (id = current_org_id() and is_org_admin())
  with check (id = current_org_id() and is_org_admin());

-- No insert/delete policy: organizations are created by the service-role
-- signup flow (src/app/api/signup/route.ts), which bypasses RLS by design.

alter table organization_rulebooks enable row level security;

drop policy if exists organization_rulebooks_select on organization_rulebooks;
create policy organization_rulebooks_select on organization_rulebooks for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists organization_rulebooks_update on organization_rulebooks;
create policy organization_rulebooks_update on organization_rulebooks for update
  to authenticated using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- 2. PERSONA OWNERSHIP — restore rep-level scoping under the org check
-- ============================================================================

drop policy if exists content_personas_select on content_personas;
create policy content_personas_select on content_personas for select
  to authenticated using (
    organization_id = current_org_id()
    and (rep_id = auth.uid() or is_org_admin())
  );

drop policy if exists content_personas_insert on content_personas;
create policy content_personas_insert on content_personas for insert
  to authenticated with check (
    organization_id = current_org_id()
    and (rep_id = auth.uid() or is_org_admin())
  );

drop policy if exists content_personas_update on content_personas;
create policy content_personas_update on content_personas for update
  to authenticated using (
    organization_id = current_org_id()
    and (rep_id = auth.uid() or is_org_admin())
  )
  with check (
    organization_id = current_org_id()
    and (rep_id = auth.uid() or is_org_admin())
  );

drop policy if exists content_personas_delete on content_personas;
create policy content_personas_delete on content_personas for delete
  to authenticated using (
    organization_id = current_org_id()
    and (rep_id = auth.uid() or is_org_admin())
  );

-- Helper predicate reused below: is the row's persona owned by the caller
-- (or is the caller an org admin)? Inlined per-table since Postgres RLS
-- policies can't share a parameterized function easily across tables with
-- differently-named persona_id columns — but the shape is identical
-- everywhere: `persona_id in (select id from content_personas where
-- rep_id = auth.uid()) or is_org_admin()`.

do $$
declare
  t text;
  tables text[] := array[
    'content_pillars',
    'content_drafts',
    'content_history',
    'content_profiles',
    'topic_clusters',
    'content_research_findings',
    'content_engagement_events',
    'content_draft_feedback',
    'content_memories',
    'content_opportunities',
    'content_idea_genomes',
    'content_interview_sessions',
    'content_taste_profiles',
    'content_journey',
    'content_quick_captures'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format(
      'create policy %I on %I for select to authenticated using (
         organization_id = current_org_id()
         and (persona_id in (select id from content_personas where rep_id = auth.uid()) or is_org_admin())
       )', t || '_select', t);

    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format(
      'create policy %I on %I for insert to authenticated with check (
         organization_id = current_org_id()
         and (persona_id in (select id from content_personas where rep_id = auth.uid()) or is_org_admin())
       )', t || '_insert', t);

    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format(
      'create policy %I on %I for update to authenticated using (
         organization_id = current_org_id()
         and (persona_id in (select id from content_personas where rep_id = auth.uid()) or is_org_admin())
       ) with check (
         organization_id = current_org_id()
         and (persona_id in (select id from content_personas where rep_id = auth.uid()) or is_org_admin())
       )', t || '_update', t);

    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format(
      'create policy %I on %I for delete to authenticated using (
         organization_id = current_org_id()
         and (persona_id in (select id from content_personas where rep_id = auth.uid()) or is_org_admin())
       )', t || '_delete', t);
  end loop;
end $$;

-- ============================================================================
-- 3. DERIVED-SCOPE TABLES — no direct persona_id column, scope via parent
-- ============================================================================

drop policy if exists "content_evaluations_owner" on content_evaluations;
create policy "content_evaluations_owner" on content_evaluations
  for all using (
    draft_id in (
      select d.id from content_drafts d
      join content_personas p on p.id = d.persona_id
      where p.rep_id = auth.uid() or is_org_admin()
    )
  );

drop policy if exists "content_interview_answers_owner" on content_interview_answers;
create policy "content_interview_answers_owner" on content_interview_answers
  for all using (
    session_id in (
      select s.id from content_interview_sessions s
      join content_personas p on p.id = s.persona_id
      where p.rep_id = auth.uid() or is_org_admin()
    )
  );

-- Refresh schema cache
notify pgrst, 'reload schema';
