-- 20260927: Idempotency key for logged sends (messages table)
--
-- Relay team bug bash — TEAM-003 (draft/duplicate-click pollutes timeline
-- and accountability counters).
--
-- POST /api/leads/[id]/contact (-> markContacted -> messages insert with
-- sent_text) had NO idempotency protection, unlike Email Outreach V1's
-- sendPreparedEmail (which already checks idempotency_key on
-- email_messages before doing anything). A double-click, a slow network
-- retry, or a duplicate client request could insert a second "sent"
-- messages row for the same logical send AND double-increment
-- daily_accountability.completed_count via record_activity_event.
--
-- This migration adds the same idempotency primitive Email Outreach V1
-- already has, scoped to the messages table. Purely additive: one nullable
-- column + one partial unique index (nullable so historical rows, which
-- never had a key, are completely unaffected and never collide with each
-- other or with new rows).
--
-- See src/app/api/leads/[id]/contact/route.ts and
-- src/lib/store/supabase-store.ts's markContacted() for the application-side
-- enforcement that uses this column.

alter table messages add column if not exists idempotency_key text;

-- Uniqueness is scoped by (organization_id, idempotency_key) — the same key
-- string from two different orgs must never collide with each other.
create unique index if not exists messages_org_idempotency_key_idx
  on messages(organization_id, idempotency_key)
  where idempotency_key is not null;

comment on column messages.idempotency_key is
  'Client-generated key (e.g. a UUID minted once per Log Sent attempt and '
  'reused across retries) preventing a double-click or network retry from '
  'creating a second "sent" message row and double-counting accountability. '
  'NULL for historical rows and for draft-only messages (sent_text is null), '
  'which are not send events and do not need dedup.';
