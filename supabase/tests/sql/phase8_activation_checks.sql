-- Phase 8 activation checks: notifications shape + RLS, dedupe, bounded
-- previews, MEETING_BOOKED constraint. ISOLATED DATABASE ONLY (synthetic rows).
--
-- Requires the operations harness to have run (it defines chk / act_as and
-- seeds the cast). Order:
--   psql -f operations_workspace_rls_fixture.sql
--   psql -f phase8_activation_fixture.sql
--   psql -v after=false -f operations_workspace_rls.sql        # seeds + helpers
--   psql -v after=false -f phase8_activation_checks.sql         # p8-before
--   psql -1 -f migrations/20261101120000_operations_workspace.sql
--   psql -1 -f migrations/20261101130000_meeting_booked_event.sql
--   psql -1 -f migrations/20261101135000_notifications_canonical_shape.sql
--   psql -1 -f migrations/20261101140000_notification_dedupe.sql
--   psql -1 -f migrations/20261101151000_lead_message_previews.sql
--   psql -v after=true -f phase8_activation_checks.sql          # p8-after
--
-- Cast: org A — A1, A2 (reps), AD (org ADMIN); org B — Z.

\set ON_ERROR_STOP on
\set QUIET on
reset role;
select set_config('rls.phase', case when :'after' then 'p8-after' else 'p8-before' end, false);
delete from rls_results where phase = current_setting('rls.phase');

\if :after
\else
-- Seed (as postgres): one legacy-shaped notification for A1, one lead with a
-- long latest message, one lead in org B.
insert into notifications (id, organization_id, rep_id, type, title, message)
values ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001', 'reply', 'Legacy', 'old body')
on conflict do nothing;
insert into leads (id, organization_id, owner_rep_id) values
  ('d0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001')
on conflict do nothing;
insert into messages (organization_id, lead_id, direction, sent_text, sent_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'outbound', 'first', now() - interval '2 hours'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'inbound', repeat('y', 5000), now() - interval '1 hour'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'inbound', 'org b', now());

-- ─── before: the production exposure, reproduced ───────────────────────────
begin;
set local role anon;
select chk('NOTIF_EXPOSURE (before): anon reads notifications', 1, (select count(*) from notifications));
commit;

do $$
begin
  insert into action_events (organization_id, action_type) values ('aaaaaaaa-0000-0000-0000-000000000001', 'MEETING_BOOKED');
  perform chk('MEETING_CONSTRAINT (before): MEETING_BOOKED rejected', 1, 0);
exception when check_violation then
  perform chk('MEETING_CONSTRAINT (before): MEETING_BOOKED rejected', 1, 1);
end $$;
\endif

\if :after
-- ─── shape / backfill ───────────────────────────────────────────────────────
select chk('NOTIF_SHAPE: legacy row backfilled (recipient, type, body, unique legacy key)', 1, (
  select count(*) from notifications
   where id = 'c0000000-0000-0000-0000-000000000001'
     and recipient_id = 'a0000000-0000-0000-0000-000000000001'
     and notification_type = 'reply' and body = 'old body'
     and dedupe_key = 'legacy:c0000000-0000-0000-0000-000000000001'));
select chk('NOTIF_SHAPE: RLS enabled', 1, (select count(*) from pg_class where relname = 'notifications' and relrowsecurity));
select chk('NOTIF_SHAPE: dedupe index is unique', 1, (
  select count(*) from pg_indexes where indexname = 'notifications_recipient_dedupe_uniq' and indexdef like 'CREATE UNIQUE%'));

-- ─── anon locked out ────────────────────────────────────────────────────────
do $$
declare n bigint;
begin
  perform set_config('role', 'anon', true);
  select count(*) into n from notifications;
  perform chk('NOTIF_ANON: anon has no access', 1, 0);
exception when insufficient_privilege then
  perform chk('NOTIF_ANON: anon has no access', 1, 1);
end $$;
reset role;

-- ─── recipient scope ────────────────────────────────────────────────────────
begin;
select act_as('a0000000-0000-0000-0000-000000000001');  -- A1
select chk('NOTIF_SCOPE: recipient reads own', 1, (select count(*) from notifications));
commit;
begin;
select act_as('a0000000-0000-0000-0000-000000000002');  -- A2
select chk('NOTIF_SCOPE: colleague cannot read another rep''s', 0, (select count(*) from notifications));
commit;
begin;
select act_as('b0000000-0000-0000-0000-000000000001');  -- Z
select chk('NOTIF_SCOPE: other organization (even its admin) reads nothing', 0, (select count(*) from notifications));
commit;
begin;
select act_as('a0000000-0000-0000-0000-00000000000b');  -- AD (organization_roles ADMIN)
select chk('NOTIF_SCOPE: org admin reads org notifications', 1, (select count(*) from notifications));
commit;

-- ─── canonical writer: colleague may notify in-org, never cross-org ─────────
begin;
select act_as('a0000000-0000-0000-0000-000000000002');  -- A2 assigns A1 a task
insert into notifications (organization_id, recipient_id, notification_type, title, body, link, dedupe_key)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        'task_assigned', 'New task assigned', 'Call', '/tasks?task=assigned:t1', 'task_assigned:t1:a1');
select chk('NOTIF_WRITE: in-org notification with canonical columns only', 1, 1);
do $$
begin
  insert into notifications (organization_id, recipient_id, notification_type, title, body, dedupe_key)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'task_assigned', 't', '', 'task_assigned:t1:a1');
  perform chk('NOTIF_DEDUPE: replayed key rejected by the unique index', 1, 0);
exception when unique_violation then
  perform chk('NOTIF_DEDUPE: replayed key rejected by the unique index', 1, 1);
end $$;
do $$
begin
  insert into notifications (organization_id, recipient_id, notification_type, title, body, dedupe_key)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'x', 't', '', 'cross');
  perform chk('NOTIF_WRITE: cross-org insert rejected', 1, 0);
exception when insufficient_privilege then
  perform chk('NOTIF_WRITE: cross-org insert rejected', 1, 1);
end $$;
with u as (update notifications set read = true where recipient_id = 'a0000000-0000-0000-0000-000000000001' returning 1)
select chk('NOTIF_READ: non-recipient cannot mark read', 0, (select count(*) from u));
commit;
begin;
select act_as('a0000000-0000-0000-0000-000000000001');  -- A1
with u as (update notifications set read = true where recipient_id = 'a0000000-0000-0000-0000-000000000001' returning 1)
select chk('NOTIF_READ: recipient marks own read', 2, (select count(*) from u));
commit;

-- ─── bounded previews ───────────────────────────────────────────────────────
begin;
select act_as('a0000000-0000-0000-0000-000000000001');  -- A1
select chk('PREVIEW: one row per lead', 1, (select count(*) from lead_message_previews where lead_id = 'd0000000-0000-0000-0000-000000000001'));
select chk('PREVIEW: latest message, cut to 160 chars in SQL', 160, (
  select length(preview) from lead_message_previews where lead_id = 'd0000000-0000-0000-0000-000000000001' and direction = 'inbound'));
select chk('PREVIEW: caller RLS applies (other org''s lead invisible)', 0, (select count(*) from lead_message_previews where lead_id = 'd0000000-0000-0000-0000-000000000002'));
commit;
do $$
declare n bigint;
begin
  perform set_config('role', 'anon', true);
  select count(*) into n from lead_message_previews;
  perform chk('PREVIEW: anon has no access', 1, 0);
exception when insufficient_privilege then
  perform chk('PREVIEW: anon has no access', 1, 1);
end $$;
reset role;
select chk('PREVIEW_EGRESS: bytes returned vs full bodies (×100)', 3, (
  select (100 * sum(octet_length(left(sent_text, 160))) / sum(octet_length(sent_text)))::bigint
    from messages where lead_id = 'd0000000-0000-0000-0000-000000000001' and direction = 'inbound'));

-- ─── meeting constraint ─────────────────────────────────────────────────────
insert into action_events (organization_id, action_type) values ('aaaaaaaa-0000-0000-0000-000000000001', 'MEETING_BOOKED');
select chk('MEETING_CONSTRAINT: MEETING_BOOKED accepted', 1, (select count(*) from action_events where action_type = 'MEETING_BOOKED'));
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
