-- 20261105120000_production_read_scope.sql
--
-- Align production's cross-org read policies with the canonical multi-tenant
-- definition in 0021_multi_tenant_rls.sql.
--
-- Production never had 0021 applied, so six tables still carried the
-- pre-multi-tenant universal SELECT policy from
-- 0014_universal_proof_read_for_drafting.sql (`auth.role() = 'authenticated'`),
-- which let any authenticated user read every organization's rows. The
-- canonical policy is `organization_id = current_org_id()`.
--
-- Read-only policy change: no data is modified, no table is dropped, no
-- column is changed. Idempotent — safe to run repeatedly.
--
-- Affected tables: leads, messages, outcomes, profiles, proof_items,
-- extraction_runs.

drop policy if exists leads_select on leads;
create policy leads_select on leads for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists messages_select on messages;
create policy messages_select on messages for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists outcomes_select on outcomes;
create policy outcomes_select on outcomes for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists proof_items_select on proof_items;
create policy proof_items_select on proof_items for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists extraction_runs_select on extraction_runs;
create policy extraction_runs_select on extraction_runs for select
  to authenticated using (organization_id = current_org_id());

insert into supabase_migrations.schema_migrations (version, name, applied_at)
values ('20261105120000', '20261105120000_production_read_scope.sql', now())
on conflict (version) do nothing;
