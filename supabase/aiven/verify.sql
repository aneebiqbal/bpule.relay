-- ============================================================================
-- Aiven certification checks (read-only, run as the admin/service connection).
-- ============================================================================

\echo '== schema parity =='
select 'public_tables' as metric, count(*)::int as value
  from information_schema.tables where table_schema = 'public';
select 'rls_enabled_tables' as metric, count(*)::int as value
  from pg_tables where schemaname = 'public' and rowsecurity;
select 'policies' as metric, count(*)::int as value
  from pg_policies where schemaname = 'public';
select 'functions' as metric, count(*)::int as value
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public';
select 'triggers' as metric, count(*)::int as value
  from information_schema.triggers where trigger_schema = 'public';
select 'extensions' as metric, string_agg(extname, ',' order by extname) as value
  from pg_extension;

\echo '== migration parity =='
select 'recorded_migrations' as metric, count(*)::int as value
  from supabase_migrations.schema_migrations;

\echo '== roles =='
select rolname, rolbypassrls, rolcanlogin
  from pg_roles
 where rolname in ('relay_app', 'relay_service', 'authenticated', 'anon', 'service_role')
 order by rolname;

\echo '== RLS helpers =='
select 'auth_uid' as metric, auth.uid() is null as value;
select 'auth_role' as metric, auth.role() as value;

\echo '== critical tables present =='
select tablename from pg_tables
 where schemaname = 'public'
   and tablename in (
     'profiles','revenue_identities','leads','messages','conversation_states',
     'daily_target_plans','daily_accountability','assigned_tasks','action_events',
     'profile_coverage','coverage_assignments','identity_assignments',
     'provider_config','provider_saved_searches','provider_search_runs','provider_telemetry',
     'captured_prospects','contact_points','operational_jobs','upwork_jobs','upwork_applications'
   )
 order by tablename;
