-- Notifications: canonical shape + row-level security.
--
-- Production's `notifications` table (read-only schema dump, 2026-11-01) is the
-- 0088 shape — rep_id / type / title / message / metadata / read — with RLS
-- NOT enabled and ALL privileges granted to anon and authenticated. The app's
-- one writer (src/lib/notifications/deliver.ts) uses the 0085 shape:
-- recipient_id / notification_type / title / body / link / dedupe_key / read.
--
-- This migration brings either shape to the canonical one, keeps legacy
-- columns (nothing is dropped, no rows are deleted), enables RLS and revokes
-- anon access. Idempotent: safe to re-run, and a no-op on a 0085-shaped table
-- apart from the RLS / grant statements.
--
-- Must run BEFORE 20261101140000_notification_dedupe.sql.

alter table notifications add column if not exists recipient_id uuid references reps(id) on delete cascade;
alter table notifications add column if not exists notification_type text;
alter table notifications add column if not exists body text;
alter table notifications add column if not exists link text;
alter table notifications add column if not exists dedupe_key text;

-- Backfill canonical columns from the legacy ones where they exist, and relax
-- legacy NOT NULLs the canonical writer does not fill.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'notifications' and column_name = 'rep_id') then
    execute 'update notifications set recipient_id = rep_id where recipient_id is null';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'notifications' and column_name = 'type') then
    execute 'update notifications set notification_type = type where notification_type is null';
    execute 'alter table notifications alter column type drop not null';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'notifications' and column_name = 'message') then
    execute 'update notifications set body = message where body is null';
  end if;
end $$;

update notifications set notification_type = 'legacy' where notification_type is null;
update notifications set title = '' where title is null;
update notifications set body = '' where body is null;
-- Legacy rows never had a dedupe key; give each a unique one so the dedupe
-- index (next migration) cannot collapse them.
update notifications set dedupe_key = 'legacy:' || id::text where dedupe_key is null;
update notifications set read = false where read is null;

alter table notifications alter column notification_type set not null;
alter table notifications alter column title set not null;
alter table notifications alter column body set not null;
alter table notifications alter column dedupe_key set not null;
alter table notifications alter column read set default false;
alter table notifications alter column read set not null;

-- A legacy row with no recipient cannot be shown to anyone (every read filters
-- by recipient). Do not delete it; only enforce NOT NULL once none remain.
do $$
begin
  if not exists (select 1 from notifications where recipient_id is null) then
    execute 'alter table notifications alter column recipient_id set not null';
  else
    raise notice 'notifications: % rows have no recipient; recipient_id left nullable',
      (select count(*) from notifications where recipient_id is null);
  end if;
end $$;

create index if not exists notif_recipient_idx on notifications (recipient_id, created_at desc);
create index if not exists notif_unread_idx on notifications (recipient_id, read) where read = false;

-- Lock down: RLS on, no anonymous access.
alter table notifications enable row level security;
revoke all on notifications from anon;

drop policy if exists "notif_select" on notifications;
create policy "notif_select" on notifications for select using (
  organization_id = current_org_id()
  and (recipient_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin())
);

-- Any member may notify a colleague in their own organization (task
-- assignment, reassignment); never another organization.
drop policy if exists "notif_insert" on notifications;
create policy "notif_insert" on notifications for insert with check (
  organization_id = current_org_id()
);

-- Only the recipient marks their notifications read.
drop policy if exists "notif_update" on notifications;
create policy "notif_update" on notifications for update using (
  organization_id = current_org_id()
  and recipient_id in (select id from reps where auth_user_id = auth.uid())
) with check (
  organization_id = current_org_id()
  and recipient_id in (select id from reps where auth_user_id = auth.uid())
);
