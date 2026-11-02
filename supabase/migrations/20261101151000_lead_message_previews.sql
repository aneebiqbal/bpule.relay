-- Chat queue previews without moving message bodies (Phase 8 egress fix).
--
-- /chats showed a 140-char preview of each visible conversation's latest
-- message by reading full `messages.sent_text` for up to 4 rows per lead and
-- truncating on the app server. This view returns ONE row per lead (the latest
-- sent message) with the text cut to 160 characters inside Postgres, so full
-- bodies never leave the database for a list.
--
-- security_invoker: the caller's RLS on `messages` applies unchanged (no new
-- visibility). The lead_id predicate the app sends is pushed below DISTINCT ON
-- (it is the DISTINCT ON key), so the existing messages_lead_idx serves it.
-- Additive and idempotent; no table changes.

create or replace view lead_message_previews
with (security_invoker = on) as
select distinct on (m.lead_id)
  m.lead_id,
  m.organization_id,
  m.direction,
  m.thread_status,
  m.sent_at,
  left(m.sent_text, 160) as preview
from messages m
where m.sent_at is not null
order by m.lead_id, m.sent_at desc, m.id desc;

revoke all on lead_message_previews from anon;
grant select on lead_message_previews to authenticated;
