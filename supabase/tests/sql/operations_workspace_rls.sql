-- Phase 8 operations RLS matrix. ISOLATED DATABASE ONLY (synthetic rows).
--
--   psql ... -v after=false -f operations_workspace_rls.sql   # before the migration
--   psql ... -v after=true  -f operations_workspace_rls.sql   # after the migration
--
-- Cast (synthetic):
--   Org A: O owner · AD admin (org role only) · L legacy reps.role=admin but org role MEMBER
--          M manages team X {A1, A2} · N manages team Y {A1, B}
--   Org B: Z
-- Each check runs as a real `authenticated` session with JWT claims, so RLS is
-- exercised exactly as PostgREST would.

\set ON_ERROR_STOP on
\set QUIET on

-- ─── harness (as postgres) ──────────────────────────────────────────────────
create table if not exists rls_results (
  phase text not null,
  label text not null,
  expected bigint not null,
  actual bigint not null
);
delete from rls_results where phase = case when :'after' then 'after' else 'before' end;

create or replace function chk(p_label text, p_expected bigint, p_actual bigint) returns void
language sql security definer set search_path = public as
$$ insert into rls_results values (current_setting('rls.phase'), p_label, p_expected, p_actual); $$;
grant execute on function chk(text, bigint, bigint) to authenticated;

create or replace function act_as(p_rep uuid) returns void
language plpgsql as
$$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_rep, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
grant execute on function act_as(uuid) to authenticated;

-- ─── seed (idempotent) ──────────────────────────────────────────────────────
insert into organizations (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Org B')
on conflict do nothing;

insert into reps (id, organization_id, auth_user_id, name, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'O',  'admin'),
  ('a0000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b', 'AD', 'rep'),
  ('a0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000c', 'L',  'admin'),
  ('a0000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000d', 'M',  'manager'),
  ('a0000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000e', 'N',  'manager'),
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'A1', 'rep'),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'A2', 'rep'),
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'B',  'rep'),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Z',  'admin')
on conflict do nothing;

insert into organization_roles (organization_id, person_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'OWNER'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b', 'ADMIN'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000c', 'MEMBER'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000d', 'MANAGER'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000e', 'MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'OWNER')
on conflict do nothing;

insert into teams (id, organization_id, name) values
  ('7e000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Team X'),
  ('7e000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'Team Y')
on conflict do nothing;

insert into team_memberships (team_id, person_id, membership_role) values
  ('7e000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000d', 'MANAGER'),
  ('7e000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'MEMBER'),
  ('7e000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000002', 'MEMBER'),
  ('7e000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000e', 'MANAGER'),
  ('7e000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', 'MEMBER'),
  ('7e000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000003', 'MEMBER')
on conflict do nothing;

insert into leads (id, organization_id, owner_rep_id, company) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'acme'),
  ('c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'orbit'),
  ('c0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'zenith'),
  ('c0000000-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'globex')
on conflict do nothing;

insert into action_events (id, organization_id, actor_id, referred_to_rep_id, lead_id, action_type) values
  ('e0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', null, 'c0000000-0000-0000-0000-000000000001', 'DM_SENT'),
  ('e0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', null, 'c0000000-0000-0000-0000-000000000002', 'DM_SENT'),
  ('e0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', null, 'c0000000-0000-0000-0000-000000000003', 'DM_SENT'),
  ('e0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', 'LEAD_REFERRED'),
  ('e0000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000d', null, null, 'REPLY_SENT'),
  ('e0000000-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', null, 'c0000000-0000-0000-0000-0000000000f1', 'DM_SENT')
on conflict do nothing;

insert into assigned_tasks (id, organization_id, assignee_rep_id, created_by_rep_id, lead_id, kind, title) values
  ('70000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000d', 'c0000000-0000-0000-0000-000000000001', 'ADMIN', 'tA1'),
  ('70000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000d', null, 'REVIEW', 'tA2'),
  ('70000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000e', null, 'CALL', 'tB'),
  ('70000000-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', null, 'ADMIN', 'tZ')
on conflict do nothing;

insert into task_events (organization_id, task_id, event_type, actor_rep_id)
select t.organization_id, t.id, 'TASK_CREATED', t.created_by_rep_id
from assigned_tasks t
where not exists (select 1 from task_events e where e.task_id = t.id);

select set_config('rls.phase', case when :'after' then 'after' else 'before' end, false);

-- ─── MANAGER_TEAM_RLS ───────────────────────────────────────────────────────
begin;
select act_as('a0000000-0000-0000-0000-00000000000d');  -- M
select chk('MANAGER_TEAM_RLS: M reads team X memberships (M, A1, A2)', 3,
  (select count(*) from team_memberships where team_id = '7e000000-0000-0000-0000-00000000000a'));
select chk('MANAGER_TEAM_RLS: M does not read team Y rows (incl. A1''s other team)', 0,
  (select count(*) from team_memberships where team_id = '7e000000-0000-0000-0000-00000000000b'));
-- MANAGER_ACTION_EVENT_RLS
select chk('MANAGER_ACTION_EVENT_RLS: M reads A1 + A2 + own events', 3,
  (select count(*) from action_events where actor_id in (
    'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000d')));
select chk('MANAGER_ACTION_EVENT_RLS: M never reads unrelated B', 0,
  (select count(*) from action_events where actor_id = 'a0000000-0000-0000-0000-000000000003'));
select chk('MANAGER_ACTION_EVENT_RLS: M never reads org B', 0,
  (select count(*) from action_events where organization_id = 'bbbbbbbb-0000-0000-0000-000000000001'));
commit;

-- ─── REP_ACTIVITY_SCOPE ─────────────────────────────────────────────────────
begin;
select act_as('a0000000-0000-0000-0000-000000000002');  -- A2
select chk('REP_ACTIVITY_SCOPE: A2 reads own event + the referral to them', 2, (select count(*) from action_events));
select chk('REP_ACTIVITY_SCOPE: A2 reads only own membership', 1, (select count(*) from team_memberships));
commit;

-- ─── ADMIN_ACTIVITY_SCOPE ───────────────────────────────────────────────────
begin;
select act_as('a0000000-0000-0000-0000-00000000000a');  -- O (owner)
select chk('ADMIN_ACTIVITY_SCOPE: owner reads all org A events', 5, (select count(*) from action_events));
select chk('ADMIN_ACTIVITY_SCOPE: owner reads all org A memberships', 6, (select count(*) from team_memberships));
commit;

begin;
select act_as('b0000000-0000-0000-0000-000000000001');  -- Z (org B owner)
select chk('ADMIN_ACTIVITY_SCOPE: second-org owner reads only org B events', 1, (select count(*) from action_events));
select chk('ADMIN_ACTIVITY_SCOPE: second-org owner reads no org A memberships', 0, (select count(*) from team_memberships));
commit;

\if :after

-- ─── ADMIN AUTHORITY (organization_roles is canonical) ──────────────────────
begin;
select act_as('a0000000-0000-0000-0000-00000000000b');  -- AD: ADMIN role, reps.role = rep
select chk('ADMIN_AUTHORITY: org-role ADMIN is admin even with reps.role=rep', 1, (select is_org_admin_or_owner()::int));
select chk('ADMIN_AUTHORITY: org-role ADMIN reads all org A events', 5, (select count(*) from action_events));
commit;

begin;
select act_as('a0000000-0000-0000-0000-00000000000c');  -- L: reps.role admin, org role MEMBER
select chk('ADMIN_AUTHORITY: demoted legacy admin is not admin', 0, (select is_org_admin_or_owner()::int));
select chk('ADMIN_AUTHORITY: legacy is_admin() follows the canonical role', 0, (select is_admin()::int));
select chk('ADMIN_AUTHORITY: demoted legacy admin reads no other events', 0, (select count(*) from action_events));
commit;

-- ─── TASK SCOPE ─────────────────────────────────────────────────────────────
begin;
select act_as('a0000000-0000-0000-0000-00000000000d');  -- M
select chk('TASK_SCOPE: M reads team tasks tA1 + tA2 only', 2, (select count(*) from assigned_tasks));
select chk('TASK_SCOPE: M reads task events of visible tasks only', 2, (select count(*) from task_events));
-- reassign inside the team works
update assigned_tasks set assignee_rep_id = 'a0000000-0000-0000-0000-000000000002'
  where id = '70000000-0000-0000-0000-000000000001';
select chk('TASK_SCOPE: M can reassign within team', 1,
  (select count(*) from assigned_tasks where id = '70000000-0000-0000-0000-000000000001' and assignee_rep_id = 'a0000000-0000-0000-0000-000000000002'));
rollback;

begin;
select act_as('a0000000-0000-0000-0000-00000000000d');  -- M
do $$
begin
  update assigned_tasks set assignee_rep_id = 'a0000000-0000-0000-0000-000000000003'
    where id = '70000000-0000-0000-0000-000000000001';
  perform chk('TASK_SCOPE: M cannot reassign to unrelated B', 1, 0);
exception when insufficient_privilege or check_violation then
  perform chk('TASK_SCOPE: M cannot reassign to unrelated B', 1, 1);
end $$;
update assigned_tasks set title = 'hijack' where id = '70000000-0000-0000-0000-000000000003';
select chk('TASK_SCOPE: M cannot touch B''s task (0 rows visible)', 0,
  (select count(*) from assigned_tasks where title = 'hijack'));
rollback;

begin;
select act_as('a0000000-0000-0000-0000-000000000001');  -- A1
select chk('TASK_SCOPE: rep reads only own task', 1, (select count(*) from assigned_tasks));
commit;

-- ─── NOTES ──────────────────────────────────────────────────────────────────
begin;
select act_as('a0000000-0000-0000-0000-00000000000d');  -- M
insert into internal_notes (id, organization_id, subject_type, subject_id, author_rep_id, body) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'REP', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000d', 'Coaching note about A1'),
  ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'LEAD', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000d', 'Client wants a revised proposal'),
  ('a1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'ACCOUNT', 'acme', 'a0000000-0000-0000-0000-00000000000d', 'Two of our reps are at Acme')
on conflict do nothing;
insert into internal_note_events (organization_id, note_id, event_type, actor_rep_id)
select 'aaaaaaaa-0000-0000-0000-000000000001', id, 'NOTE_CREATED', 'a0000000-0000-0000-0000-00000000000d'
from internal_notes where id = 'a1000000-0000-0000-0000-000000000001';
select chk('NOTES: manager writes notes on managed rep / lead / account', 3, (select count(*) from internal_notes));
do $$
begin
  insert into internal_notes (organization_id, subject_type, subject_id, author_rep_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'REP', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000d', 'about B');
  perform chk('NOTES: manager cannot write a note about unrelated B', 1, 0);
exception when insufficient_privilege then
  perform chk('NOTES: manager cannot write a note about unrelated B', 1, 1);
end $$;
do $$
begin
  insert into internal_notes (organization_id, subject_type, subject_id, author_rep_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'LEAD', 'c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000d', 'on B''s lead');
  perform chk('NOTES: manager cannot write on B''s lead', 1, 0);
exception when insufficient_privilege then
  perform chk('NOTES: manager cannot write on B''s lead', 1, 1);
end $$;
do $$
begin
  update internal_notes set subject_id = 'a0000000-0000-0000-0000-000000000002' where id = 'a1000000-0000-0000-0000-000000000001';
  perform chk('NOTES: subject is immutable', 1, 0);
exception when raise_exception then
  perform chk('NOTES: subject is immutable', 1, 1);
end $$;
update internal_notes set body = 'Coaching note about A1 (edited)', edited_at = now() where id = 'a1000000-0000-0000-0000-000000000001';
select chk('NOTES: author edits own note', 1, (select count(*) from internal_notes where body like '%(edited)'));
commit;

begin;
select act_as('a0000000-0000-0000-0000-000000000001');  -- A1
select chk('NOTES: subject rep cannot read the manager''s note about them', 0,
  (select count(*) from internal_notes where subject_type = 'REP'));
select chk('NOTES: lead owner reads the note on their lead', 1,
  (select count(*) from internal_notes where subject_type = 'LEAD'));
select chk('NOTES: rep with a lead at the account reads the account note', 1,
  (select count(*) from internal_notes where subject_type = 'ACCOUNT'));
update internal_notes set body = 'rewritten by A1' where id = 'a1000000-0000-0000-0000-000000000002';
commit;

begin;
select act_as('a0000000-0000-0000-0000-000000000002');  -- A2
select chk('NOTES: other rep reads none of these notes', 0, (select count(*) from internal_notes));
select chk('NOTES: other rep reads no note audit rows', 0, (select count(*) from internal_note_events));
commit;

begin;
select act_as('a0000000-0000-0000-0000-00000000000e');  -- N manages A1 via team Y
select chk('NOTES: second manager of A1 reads the REP note', 1, (select count(*) from internal_notes where subject_type = 'REP'));
commit;

begin;
select act_as('a0000000-0000-0000-0000-00000000000a');  -- O
select chk('NOTES: non-author cannot rewrite a note (A1 attempt had no effect)', 0,
  (select count(*) from internal_notes where body = 'rewritten by A1'));
select chk('NOTES: owner reads every org note and its audit', 4,
  (select count(*) from internal_notes) + (select count(*) from internal_note_events));
do $$
begin
  update internal_notes set body = 'admin rewrite' where id = 'a1000000-0000-0000-0000-000000000002';
  perform chk('NOTES: admin cannot rewrite another author''s note', 1, 0);
exception when raise_exception then
  perform chk('NOTES: admin cannot rewrite another author''s note', 1, 1);
end $$;
update internal_notes set deleted_at = now(), deleted_by_rep_id = 'a0000000-0000-0000-0000-00000000000a'
  where id = 'a1000000-0000-0000-0000-000000000003';
select chk('NOTES: admin soft-deletes any note', 1, (select count(*) from internal_notes where deleted_at is not null));
rollback;

begin;
select act_as('b0000000-0000-0000-0000-000000000001');  -- Z
select chk('NOTES: second org reads no org A notes', 0, (select count(*) from internal_notes));
commit;

-- ─── SAVED_VIEW_SCOPE ───────────────────────────────────────────────────────
begin;
select act_as('a0000000-0000-0000-0000-000000000001');  -- A1
insert into saved_views (organization_id, owner_rep_id, surface, name, query)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'team.tasks', 'Overdue', 'view=overdue')
on conflict do nothing;
do $$
begin
  insert into saved_views (organization_id, owner_rep_id, surface, name, query)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'team.tasks', 'Planted', '');
  perform chk('SAVED_VIEW_SCOPE: cannot create a view for someone else', 1, 0);
exception when insufficient_privilege then
  perform chk('SAVED_VIEW_SCOPE: cannot create a view for someone else', 1, 1);
end $$;
select chk('SAVED_VIEW_SCOPE: owner reads own view', 1, (select count(*) from saved_views));
commit;

begin;
select act_as('a0000000-0000-0000-0000-00000000000a');  -- O, even as owner
select chk('SAVED_VIEW_SCOPE: views are private even from the owner role', 0, (select count(*) from saved_views));
commit;

\endif

-- ─── summary ────────────────────────────────────────────────────────────────
reset role;
\set QUIET off
select label, expected, actual, case when expected = actual then 'PASS' else 'FAIL' end as result
from rls_results where phase = current_setting('rls.phase') order by result, label;
select current_setting('rls.phase') as phase,
       count(*) filter (where expected = actual) as pass,
       count(*) filter (where expected <> actual) as fail
from rls_results where phase = current_setting('rls.phase');
