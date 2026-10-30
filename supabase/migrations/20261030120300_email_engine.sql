-- ============================================================================
-- Autonomous Email Engine — schema
--
-- The audit found the email tables real but incomplete: `email_messages` had
-- provider ids and a delivery status but no reply relationship, no failure
-- classification and no inbound timestamp; `email_mailboxes` had an unused
-- `secrets_ciphertext` column and a free-text status; and the send window stored
-- in `email_sending_policies` (`working_hours 0-23`, `timezone='UTC'`) was never
-- read, so the effective window was "always".
--
-- Nothing here replaces `email_messages` or `messages`. Contract 14 fixes the
-- boundary: `email_messages` owns delivery, `messages` owns conversation.
--
-- Not applied by this change. `supabase db push` is out of order locally; a
-- human applies the migration files in sequence.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. email_messages — reply relationship, failure, inbound timestamp
-- ---------------------------------------------------------------------------

alter table email_messages
  add column if not exists in_reply_to_provider_message_id text,
  add column if not exists failure_reason text,
  add column if not exists failure_code text,
  add column if not exists received_at timestamptz,
  add column if not exists sender_profile_id text;

-- A reply is matched to its outbound message by provider id, never by subject.
create index if not exists em_org_in_reply_to_idx
  on email_messages (organization_id, in_reply_to_provider_message_id)
  where in_reply_to_provider_message_id is not null;

comment on column email_messages.in_reply_to_provider_message_id is
  'Provider message id of the outbound message this inbound reply answers. Reply identity is structural, never textual.';
comment on column email_messages.failure_code is
  'Stable machine category (provider_rejected, provider_unavailable, mailbox_degraded, persist_failed_after_provider_accept). Free-text detail lives in failure_reason.';
comment on column email_messages.sender_profile_id is
  'The Relay sender profile that owns this mailbox, so a mailbox connection is attributable to one identity.';

-- ---------------------------------------------------------------------------
-- 2. email_mailboxes — health, sync cursor, quota and failure counters
-- ---------------------------------------------------------------------------

alter table email_mailboxes
  add column if not exists last_sync_at timestamptz,
  add column if not exists last_send_at timestamptz,
  add column if not exists last_history_id text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists token_scope text,
  add column if not exists consecutive_failures int not null default 0,
  add column if not exists sent_today int not null default 0,
  add column if not exists sent_today_date date,
  add column if not exists health text not null default 'DISCONNECTED'
    check (health in ('CONNECTED', 'REAUTH_REQUIRED', 'DISCONNECTED', 'DEGRADED', 'PAUSED')),
  add column if not exists paused_at timestamptz;

create index if not exists emb_org_health_idx
  on email_mailboxes (organization_id, health);

comment on column email_mailboxes.last_history_id is
  'Gmail history cursor. Reply sync resumes from here, so an inbox is never re-downloaded wholesale.';
comment on column email_mailboxes.health is
  'Derived by deriveMailboxHealth, never written by hand. Only CONNECTED may send.';
comment on column email_mailboxes.consecutive_failures is
  'Provider failures since the last success. At 3 the mailbox is DEGRADED and sending stops.';

-- ---------------------------------------------------------------------------
-- 3. organization_email_policy — one policy per organization
-- ---------------------------------------------------------------------------
--
-- Send windows derive from organization_operating_policy.timezone. This table
-- holds only what is genuinely email-specific: whether email is on, how much
-- autonomy it has, and the limits a mailbox must respect.

create table if not exists organization_email_policy (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  enabled boolean not null default false,

  -- MANUAL: Relay prepares only. APPROVAL_REQUIRED: a human approves each send.
  -- AUTOPILOT: Relay may send without a human, inside the closed safe class set.
  autonomy_mode text not null default 'APPROVAL_REQUIRED'
    check (autonomy_mode in ('MANUAL', 'APPROVAL_REQUIRED', 'AUTOPILOT')),

  -- Minimum opportunity confidence and verified-email requirement. A lead that
  -- does not clear these is never drafted, not drafted-then-blocked.
  minimum_confidence text not null default 'Potential'
    check (minimum_confidence in ('Possible', 'Potential', 'Unverified')),
  require_verified_email boolean not null default true,

  -- Rate safety, per mailbox. 0 means "no separate cap".
  hourly_send_cap int not null default 0 check (hourly_send_cap >= 0),
  minimum_spacing_seconds int not null default 60 check (minimum_spacing_seconds >= 0),
  consecutive_failure_threshold int not null default 3 check (consecutive_failure_threshold > 0),
  bounce_threshold int not null default 1 check (bounce_threshold > 0),

  -- Weekend policy: sending on a non-working day is never allowed.
  weekend_policy text not null default 'SKIP'
    check (weekend_policy in ('SKIP', 'ALLOW')),

  -- Cooldown after a reply before another cold follow-up may be drafted.
  reply_cooldown_hours int not null default 72 check (reply_cooldown_hours >= 0),

  updated_at timestamptz not null default now(),

  unique (organization_id)
);

alter table organization_email_policy enable row level security;
create policy oep_org_isolation on organization_email_policy
  using (organization_id = current_org_id());

comment on table organization_email_policy is
  'Per-organization email policy. Send windows come from organization_operating_policy; this table holds only email-specific limits and autonomy.';

-- ---------------------------------------------------------------------------
-- 4. email_oauth_challenges — single-use OAuth state
-- ---------------------------------------------------------------------------
--
-- The PKCE verifier must never reach the browser, and the state must be
-- single-use: without server-side storage a captured callback URL is replayable.

create table if not exists email_oauth_challenges (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  organization_id uuid not null references organizations(id) on delete cascade,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  code_verifier text not null,
  redirect_to text not null default '/settings/mailboxes',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists eoc_expires_idx on email_oauth_challenges (expires_at);

alter table email_oauth_challenges enable row level security;
-- No authenticated policy: the callback runs as the service role and matches on
-- the state hash, which is unguessable.

comment on table email_oauth_challenges is
  'Server-side PKCE verifier and single-use marker for a mailbox OAuth handshake. A replayed state is rejected because consumed_at is already set.';

-- ---------------------------------------------------------------------------
-- 5. operational_jobs — the email job kinds the worker already drains
-- ---------------------------------------------------------------------------

alter table operational_jobs drop constraint if exists operational_jobs_job_kind_check;

alter table operational_jobs
  add constraint operational_jobs_job_kind_check check (job_kind in (
    'OPEN_DAY',
    'EVALUATE_REP_DAY',
    'EMIT_WARNING',
    'EMIT_ESCALATION',
    'CLOSE_MISSED_DAY',
    'PREPARE_CARRYOVER',
    'EVALUATE_FOLLOWUP',
    'ENQUEUE_EMAIL',
    'SYNC_MAILBOX',
    'SEND_EMAIL',
    'SEND_FOLLOWUP',
    'PROCESS_INBOUND_EMAIL',
    'RETRY_EMAIL'
  ));

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   -- Reply identity must be structural.
--   select count(*) from email_messages
--   where in_reply_to_provider_message_id is not null;   -- only real replies
--
--   -- No mailbox may claim CONNECTED while backed by the no-op provider.
--   select id, provider, health from email_mailboxes
--   where provider = 'relay_noop' and health = 'CONNECTED';   -- zero rows
-- ---------------------------------------------------------------------------
