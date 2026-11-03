-- Anon / cross-org / role-scope checks for 20261101160000_close_anon_exposure.sql.
-- ISOLATED DATABASE ONLY: a production-shaped copy (the schema-only dump plus the
-- pending migrations) with the synthetic rows seeded below. Never production.
--
--   psql -v phase=before -f security_anon_exposure_checks.sql   # on the raw dump
--   (apply the pending migrations in order)
--   psql -v phase=after  -f security_anon_exposure_checks.sql
--
-- Expected values describe the AFTER state; the before run reproduces the exposure.
-- Cast — org A: AD (admin/ADMIN), MG (manager of team T1), R1 (T1 member), R2 (no
-- team). Org B: ZA (admin of B).

\set ON_ERROR_STOP on
\set QUIET on
reset role;

create schema if not exists sec_test;
create table if not exists sec_test.results (phase text, label text, expected text, actual text);
delete from sec_test.results where phase = :'phase';
select set_config('sec.phase', :'phase', false);

create or replace function sec_test.chk(p_label text, p_expected text, p_actual text) returns void
language sql security definer set search_path = sec_test, public as
$$ insert into sec_test.results values (current_setting('sec.phase'), p_label, p_expected, p_actual) $$;

-- Runs a statement as the CURRENT role and undoes its effects: 'ok', the row
-- count for a query, or the SQLSTATE it raised.
create or replace function sec_test.try(p_sql text) returns text
language plpgsql security invoker as
$$
declare
  result text;
begin
  begin
    if p_sql ~* '^\s*(select\s+count|with\s)' then
      execute p_sql into result;
    else
      execute p_sql;
      result := 'ok';
    end if;
    raise exception 'sec_test_undo';
  exception when others then
    if sqlerrm = 'sec_test_undo' then
      return result;
    end if;
    return sqlstate;
  end;
end $$;

create or replace function sec_test.act_as(p_auth uuid) returns void
language plpgsql as
$$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_auth::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function sec_test.act_service() returns void
language plpgsql as
$$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('role', 'service_role', true);
end $$;

grant usage on schema sec_test to anon, authenticated, service_role;
grant execute on all functions in schema sec_test to anon, authenticated, service_role;

-- ─── seed (as the owner, triggers off; idempotent) ─────────────────────────
set session_replication_role = replica;
insert into auth.users (id, email) values
  ('1a000000-0000-0000-0000-0000000000ad', 'ad@example.test'),
  ('1a000000-0000-0000-0000-0000000000a9', 'mg@example.test'),
  ('1a000000-0000-0000-0000-0000000000a1', 'r1@example.test'),
  ('1a000000-0000-0000-0000-0000000000a2', 'r2@example.test'),
  ('1b000000-0000-0000-0000-0000000000ad', 'za@example.test')
on conflict do nothing;
insert into organizations (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A (synthetic)'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Org B (synthetic)')
on conflict do nothing;
insert into reps (id, organization_id, auth_user_id, name, role) values
  ('a0000000-0000-0000-0000-0000000000ad', 'aaaaaaaa-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-0000000000ad', 'AD', 'admin'),
  ('a0000000-0000-0000-0000-0000000000a9', 'aaaaaaaa-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-0000000000a9', 'MG', 'rep'),
  ('a0000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-0000000000a1', 'R1', 'rep'),
  ('a0000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-0000000000a2', 'R2', 'rep'),
  ('b0000000-0000-0000-0000-0000000000ad', 'bbbbbbbb-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-0000000000ad', 'ZA', 'admin')
on conflict do nothing;
insert into organization_roles (organization_id, person_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000ad', 'ADMIN'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a9', 'MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000ad', 'ADMIN')
on conflict do nothing;
insert into teams (id, organization_id, name) values
  ('7a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'T1')
on conflict do nothing;
insert into team_memberships (team_id, person_id, membership_role) values
  ('7a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a9', 'MANAGER'),
  ('7a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1', 'MEMBER')
on conflict do nothing;
insert into leads (id, organization_id, owner_rep_id, company) values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1', 'Lead 1 Co'),
  ('d1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a2', 'Lead 2 Co')
on conflict do nothing;
insert into revenue_identities (id, organization_id, slug, identity_name) values
  ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'ia1', 'Identity 1'),
  ('e1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'ia2', 'Identity 2')
on conflict do nothing;
insert into identity_assignments (id, organization_id, revenue_identity_id, rep_id) values
  ('e2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1'),
  ('e2000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a2'),
  ('e2000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000a9')
on conflict do nothing;
insert into relay_runs (id, organization_id, run_type, primary_entity_type, primary_entity_id, status, assigned_rep_id) values
  ('f1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'outbound', 'lead', 'd1000000-0000-0000-0000-000000000001', 'detected', 'a0000000-0000-0000-0000-0000000000a1'),
  ('f1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'outbound', 'lead', 'd1000000-0000-0000-0000-000000000002', 'detected', 'a0000000-0000-0000-0000-0000000000a2'),
  ('f1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'upwork', 'upwork_job', 'f9000000-0000-0000-0000-000000000001', 'detected', 'a0000000-0000-0000-0000-0000000000a2')
on conflict do nothing;
insert into relay_events (id, organization_id, event_type, entity_type, entity_id, actor_type, actor_id, relay_run_id) values
  ('f2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'run.created', 'lead', 'd1000000-0000-0000-0000-000000000001', 'system', null, 'f1000000-0000-0000-0000-000000000001'),
  ('f2000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'action', 'profile', null, 'rep', 'a0000000-0000-0000-0000-0000000000a1', null),
  ('f2000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'action', 'profile', null, 'rep', 'a0000000-0000-0000-0000-0000000000a2', null),
  ('f2000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'run.created', 'upwork_job', null, 'system', null, 'f1000000-0000-0000-0000-000000000003')
on conflict do nothing;
insert into accountability_audit_log (id, organization_id, actor_id, action) values
  ('f3000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1', 'identity_assigned'),
  ('f3000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a2', 'identity_assigned')
on conflict do nothing;
insert into activity_log (id, organization_id, event_type, actor_id) values
  ('f4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'x', 'a0000000-0000-0000-0000-0000000000a1'),
  ('f4000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'x', 'a0000000-0000-0000-0000-0000000000a2')
on conflict do nothing;
insert into style_cards (id, organization_id, rep_id, style_card) values
  ('f5000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1', '{}'),
  ('f5000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a2', '{}')
on conflict do nothing;
set session_replication_role = origin;

-- ─── catalog ────────────────────────────────────────────────────────────────
select sec_test.chk('CATALOG: public tables with RLS off', '0', (
  select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity));
select sec_test.chk('CATALOG: the 8 tables + signal_events grant anon nothing', '0', (
  select count(*)::text from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'
     and table_name in ('notifications', 'relay_events', 'relay_runs', 'revenue_identities', 'identity_assignments',
                        'accountability_audit_log', 'activity_log', 'style_cards', 'signal_events')));
select sec_test.chk('CATALOG: guarded/relay functions executable by anon', '0', (
  select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('ensure_day_close', 'ensure_day_closes_for_person', 'get_run_events', 'record_activity_event',
                       'record_canonical_progress', 'transition_relay_run', 'create_relay_run', 'emit_relay_event',
                       'is_org_working_day', 'refresh_few_shot_wins')
     and has_function_privilege('anon', p.oid, 'execute')));
select sec_test.chk('CATALOG: write policies with a literal TRUE check open to anon/public', '0', (
  select count(*)::text from pg_policies
   where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     and (roles && array['public', 'anon']::name[])
     and (coalesce(with_check, qual) = 'true')));
select sec_test.chk('CATALOG: 20261101150000 search_path still pinned on the 3 guarded functions', '3', (
  select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('ensure_day_close', 'ensure_day_closes_for_person', 'record_canonical_progress')
     and p.proconfig @> array['search_path=public, extensions']));
select sec_test.chk('CATALOG: no-arg refresh_few_shot_wins is service-role only', 'false', (
  select has_function_privilege('authenticated', 'public.refresh_few_shot_wins()', 'execute')::text));

-- ─── anon: no table, no guarded function ────────────────────────────────────
begin;
set local role anon;
select sec_test.chk('ANON: notifications', '42501', sec_test.try('select count(*) from notifications'));
select sec_test.chk('ANON: relay_events', '42501', sec_test.try('select count(*) from relay_events'));
select sec_test.chk('ANON: relay_runs', '42501', sec_test.try('select count(*) from relay_runs'));
select sec_test.chk('ANON: revenue_identities', '42501', sec_test.try('select count(*) from revenue_identities'));
select sec_test.chk('ANON: identity_assignments', '42501', sec_test.try('select count(*) from identity_assignments'));
select sec_test.chk('ANON: accountability_audit_log', '42501', sec_test.try('select count(*) from accountability_audit_log'));
select sec_test.chk('ANON: activity_log', '42501', sec_test.try('select count(*) from activity_log'));
select sec_test.chk('ANON: style_cards', '42501', sec_test.try('select count(*) from style_cards'));
select sec_test.chk('ANON: insert signal_events', '42501', sec_test.try(
  $q$insert into signal_events (organization_id, signal_type) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x')$q$));
select sec_test.chk('ANON: transition_relay_run', '42501', sec_test.try(
  $q$select public.transition_relay_run('f1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cancelled')$q$));
select sec_test.chk('ANON: record_canonical_progress', '42501', sec_test.try(
  $q$select public.record_canonical_progress('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1',
     'e1000000-0000-0000-0000-000000000001', 'OUTREACH_RECORDED', 'connections', 'sec:anon', current_date)$q$));
select sec_test.chk('ANON: get_run_events', '42501', sec_test.try(
  $q$select public.get_run_events('f1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')$q$));
commit;

-- ─── cross-org: an admin of org B against org A ─────────────────────────────
begin;
select sec_test.act_as('1b000000-0000-0000-0000-0000000000ad');  -- ZA
select sec_test.chk('XORG: relay_events', '0', sec_test.try($q$select count(*) from relay_events where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$));
select sec_test.chk('XORG: relay_runs', '0', sec_test.try($q$select count(*) from relay_runs where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$));
select sec_test.chk('XORG: revenue_identities', '0', sec_test.try($q$select count(*) from revenue_identities where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$));
select sec_test.chk('XORG: identity_assignments', '0', sec_test.try($q$select count(*) from identity_assignments where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$));
select sec_test.chk('XORG: accountability_audit_log', '0', sec_test.try($q$select count(*) from accountability_audit_log where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$));
select sec_test.chk('XORG: activity_log', '0', sec_test.try($q$select count(*) from activity_log where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$));
select sec_test.chk('XORG: style_cards', '0', sec_test.try($q$select count(*) from style_cards where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$));
select sec_test.chk('XORG: insert revenue_identities into org A', '42501', sec_test.try(
  $q$insert into revenue_identities (organization_id, slug, identity_name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'x')$q$));
select sec_test.chk('XORG: insert signal_events into org A', '42501', sec_test.try(
  $q$insert into signal_events (organization_id, signal_type) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x')$q$));
select sec_test.chk('XORG: transition_relay_run on an org A run', '42501', sec_test.try(
  $q$select public.transition_relay_run('f1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cancelled')$q$));
select sec_test.chk('XORG: get_run_events on an org A run', '42501', sec_test.try(
  $q$select public.get_run_events('f1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')$q$));
select sec_test.chk('XORG: record_canonical_progress for an org A rep', '42501', sec_test.try(
  $q$select public.record_canonical_progress('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1',
     'e1000000-0000-0000-0000-000000000001', 'OUTREACH_RECORDED', 'connections', 'sec:xorg', current_date)$q$));
select sec_test.chk('XORG: record_activity_event for an org A rep', '42501', sec_test.try(
  $q$select public.record_activity_event('a0000000-0000-0000-0000-0000000000a1', 'e1000000-0000-0000-0000-000000000001', 'connection',
     'aaaaaaaa-0000-0000-0000-000000000001', 'sec:xorg', current_date)$q$));
select sec_test.chk('XORG: ensure_day_closes_for_person for an org A rep', '42501', sec_test.try(
  $q$select count(*) from public.ensure_day_closes_for_person('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1', current_date)$q$));
commit;

-- ─── role scope inside org A ────────────────────────────────────────────────
begin;
select sec_test.act_as('1a000000-0000-0000-0000-0000000000a1');  -- R1, rep
select sec_test.chk('SCOPE R1: identity_assignments → own only', '1', sec_test.try('select count(*) from identity_assignments'));
select sec_test.chk('SCOPE R1: revenue_identities → org configuration', '2', sec_test.try('select count(*) from revenue_identities'));
select sec_test.chk('SCOPE R1: relay_runs → lead-linked (leads RLS is org-wide), not R2''s upwork run', '2', sec_test.try('select count(*) from relay_runs'));
select sec_test.chk('SCOPE R1: relay_events → own action + visible run, not R2''s', '2', sec_test.try('select count(*) from relay_events'));
select sec_test.chk('SCOPE R1: audit log → own entries', '1', sec_test.try('select count(*) from accountability_audit_log'));
select sec_test.chk('SCOPE R1: activity_log → own entries', '1', sec_test.try('select count(*) from activity_log'));
select sec_test.chk('SCOPE R1: style_cards → own', '1', sec_test.try('select count(*) from style_cards'));
select sec_test.chk('SCOPE R1: cannot assign identities', '42501', sec_test.try(
  $q$insert into identity_assignments (organization_id, revenue_identity_id, rep_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000a1')$q$));
select sec_test.chk('SCOPE R1: cannot create identities', '42501', sec_test.try(
  $q$insert into revenue_identities (organization_id, slug, identity_name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'r1', 'x')$q$));
select sec_test.chk('SCOPE R1: cannot forge an audit entry as R2', '42501', sec_test.try(
  $q$insert into accountability_audit_log (organization_id, actor_id, action) values ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a2', 'x')$q$));
select sec_test.chk('SCOPE R1: writes own audit entry', 'ok', sec_test.try(
  $q$insert into accountability_audit_log (organization_id, actor_id, action) values ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1', 'x')$q$));
select sec_test.chk('SCOPE R1: cannot edit R2''s style card (0 rows)', '0', sec_test.try(
  $q$with u as (update style_cards set sample_source = 'x' where id = 'f5000000-0000-0000-0000-000000000002' returning 1) select count(*) from u$q$));
select sec_test.chk('SCOPE R1: signal_events insert in own org', 'ok', sec_test.try(
  $q$insert into signal_events (organization_id, signal_type) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x')$q$));
select sec_test.chk('RPC R1: progress for self passes the guard', 'not 42501', (
  select case when r = '42501' then r else 'not 42501' end from sec_test.try(
  $q$select public.record_canonical_progress('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1',
     'e1000000-0000-0000-0000-000000000001', 'OUTREACH_RECORDED', 'connections', 'sec:r1', current_date)$q$) r));
select sec_test.chk('RPC R1: progress for colleague R2 refused', '42501', sec_test.try(
  $q$select public.record_canonical_progress('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a2',
     'e1000000-0000-0000-0000-000000000001', 'OUTREACH_RECORDED', 'connections', 'sec:r1r2', current_date)$q$));
select sec_test.chk('RPC R1: activity event for colleague R2 refused', '42501', sec_test.try(
  $q$select public.record_activity_event('a0000000-0000-0000-0000-0000000000a2', 'e1000000-0000-0000-0000-000000000001', 'connection',
     'aaaaaaaa-0000-0000-0000-000000000001', 'sec:r1r2', current_date)$q$));
select sec_test.chk('RPC R1: ensure own day closes passes', 'not 42501', (
  select case when r = '42501' then r else 'not 42501' end from sec_test.try(
  $q$select count(*) from public.ensure_day_closes_for_person('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1', current_date)$q$) r));
select sec_test.chk('RPC R1: transition own org run', 'ok', sec_test.try(
  $q$select public.transition_relay_run('f1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'qualifying')$q$));
commit;

begin;
select sec_test.act_as('1a000000-0000-0000-0000-0000000000a9');  -- MG, manager of T1 (MG + R1)
select sec_test.chk('SCOPE MG: identity_assignments → self + managed R1', '2', sec_test.try('select count(*) from identity_assignments'));
select sec_test.chk('SCOPE MG: cannot assign identities', '42501', sec_test.try(
  $q$insert into identity_assignments (organization_id, revenue_identity_id, rep_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000a1')$q$));
commit;

begin;
select sec_test.act_as('1a000000-0000-0000-0000-0000000000ad');  -- AD, org admin
select sec_test.chk('SCOPE AD: identity_assignments → organization', '3', sec_test.try('select count(*) from identity_assignments'));
select sec_test.chk('SCOPE AD: relay_runs → organization', '3', sec_test.try('select count(*) from relay_runs'));
select sec_test.chk('SCOPE AD: relay_events → organization', '4', sec_test.try('select count(*) from relay_events'));
select sec_test.chk('SCOPE AD: audit log → organization', '2', sec_test.try('select count(*) from accountability_audit_log'));
select sec_test.chk('SCOPE AD: style_cards → read organization', '2', sec_test.try('select count(*) from style_cards'));
select sec_test.chk('SCOPE AD: assigns an identity', 'ok', sec_test.try(
  $q$insert into identity_assignments (organization_id, revenue_identity_id, rep_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000a2')$q$));
select sec_test.chk('SCOPE AD: creates an identity', 'ok', sec_test.try(
  $q$insert into revenue_identities (organization_id, slug, identity_name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'ad', 'x')$q$));
select sec_test.chk('RPC AD: progress for org rep R2 passes the guard', 'not 42501', (
  select case when r = '42501' then r else 'not 42501' end from sec_test.try(
  $q$select public.record_canonical_progress('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a2',
     'e1000000-0000-0000-0000-000000000001', 'OUTREACH_RECORDED', 'connections', 'sec:ad', current_date)$q$) r));
commit;

begin;
select sec_test.act_service();
select sec_test.chk('SERVICE: transition_relay_run passes the guard', 'ok', sec_test.try(
  $q$select public.transition_relay_run('f1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'qualifying')$q$));
commit;

-- ─── summary ────────────────────────────────────────────────────────────────
reset role;
\set QUIET off
select label, expected, actual, case when expected = actual then 'PASS' else 'FAIL' end as result
from sec_test.results where phase = :'phase' order by result, label;
select :'phase' as phase,
       count(*) filter (where expected = actual) as pass,
       count(*) filter (where expected <> actual) as fail
from sec_test.results where phase = :'phase';
