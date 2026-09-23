-- 20260930000002: Track LinkedIn connection acceptance on a lead
--
-- Relay's messaging lifecycle requires: connection note sent -> wait for the
-- prospect to accept -> only then is a DM appropriate. No signal for this
-- existed anywhere (not in leads.status, not on messages) — a real gap, not
-- a wiring bug: src/lib/relay/timing-engine.ts already modeled a
-- connectionAccepted concept, but every call site hardcoded it to false and
-- its output was never rendered, so it was decorative scaffolding, not a
-- real gate.
--
-- Manual BD confirmation (not a LinkedIn integration/webhook, which doesn't
-- exist): a rep marks the row explicitly once they see the connection
-- accepted on LinkedIn. A timestamp (not just a boolean) doubles as the
-- anchor for downstream timing logic (e.g. "how long since accepted").
--
-- Purely additive: one nullable column, one supporting index. A NULL value
-- means "not accepted / not applicable" — never inferred, never assumed.

alter table leads add column if not exists connection_accepted_at timestamptz;

create index if not exists leads_connection_accepted_idx
  on leads(connection_accepted_at)
  where connection_accepted_at is not null;

comment on column leads.connection_accepted_at is
  'Set by explicit rep action (POST /api/leads/[id]/connection-accepted) when the rep observes the LinkedIn connection request was accepted. NULL means not yet accepted or not applicable (e.g. no connection note was ever sent for this lead). Never inferred automatically.';
