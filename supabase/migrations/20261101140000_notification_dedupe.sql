-- Notification idempotency: at most one notification per (org, recipient, dedupe_key).
--
-- notif_dedupe_idx (0085) is NOT unique, so a replayed event could notify twice.
-- The app now checks before inserting (src/lib/notifications/deliver.ts); this
-- makes the database authoritative.
--
-- REVIEW BEFORE APPLYING: the delete keeps the OLDEST row of each duplicate
-- group and removes the rest (read state of the newer duplicates is lost).
-- Run the count first:
--   select count(*) - count(distinct (organization_id, recipient_id, dedupe_key)) from notifications;

delete from notifications n
using notifications older
where n.organization_id = older.organization_id
  and n.recipient_id = older.recipient_id
  and n.dedupe_key = older.dedupe_key
  and (older.created_at, older.id) < (n.created_at, n.id);

create unique index if not exists notifications_recipient_dedupe_uniq
  on notifications (organization_id, recipient_id, dedupe_key);
