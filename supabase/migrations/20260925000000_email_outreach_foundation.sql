-- 20260925: Relay Smart Email Outreach foundation
--
-- Email is a first-class Relay channel, not a separate product.
-- This migration adds the minimum durable primitives:
-- - canonical contact points with provenance + verification
-- - identity mailboxes + sending policy
-- - prepared email drafts (strategy/research/claim-safety envelope)
-- - provider metadata + delivery event ledger
-- - suppression and idempotent send attempts

-- ==========================================================================
-- Extend existing channel/message constraints
-- ==========================================================================

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'revenue_identities'
      and constraint_name = 'revenue_identities_channel_check'
  ) then
    alter table revenue_identities drop constraint revenue_identities_channel_check;
  end if;
exception
  when undefined_table then null;
end $$;

alter table if exists revenue_identities
  add constraint revenue_identities_channel_check
  check (channel in ('linkedin', 'email', 'upwork', 'other'));

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'messages'
      and constraint_name = 'messages_type_check'
  ) then
    alter table messages drop constraint messages_type_check;
  end if;
exception
  when undefined_table then null;
end $$;

alter table if exists messages
  add constraint messages_type_check
  check (type in ('dm', 'connection', 'upwork', 'email', 'followup', 'reply'));

-- ==========================================================================
-- Contact intelligence
-- ==========================================================================

create table if not exists contact_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  person_id text,
  company_id text,
  type text not null check (type in ('email', 'linkedin', 'contact_form', 'phone', 'other')),
  value text not null,
  value_key text generated always as (lower(trim(value))) stored,
  source text not null check (source in (
    'USER_PROVIDED',
    'PUBLIC_PROFILE',
    'COMPANY_WEBSITE',
    'PUBLIC_DIRECTORY',
    'CONNECTED_PROVIDER',
    'INBOUND',
    'INFERRED_PATTERN'
  )),
  source_url text,
  source_type text,
  verification_status text not null default 'UNKNOWN' check (verification_status in (
    'VERIFIED',
    'LIKELY_VALID',
    'UNVERIFIED',
    'INVALID',
    'BOUNCED',
    'UNKNOWN'
  )),
  verification_method text,
  confidence numeric(5,4),
  is_primary boolean not null default false,
  is_business_contact boolean not null default true,
  discovered_at timestamptz not null default now(),
  verified_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, lead_id, type, value_key)
);

create index if not exists cp_org_idx on contact_points (organization_id);
create index if not exists cp_org_lead_idx on contact_points (organization_id, lead_id);
create index if not exists cp_org_type_idx on contact_points (organization_id, type);
create index if not exists cp_org_verification_idx on contact_points (organization_id, verification_status);

alter table contact_points enable row level security;

drop policy if exists "cp_select" on contact_points;
create policy "cp_select" on contact_points for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "cp_insert" on contact_points;
create policy "cp_insert" on contact_points for insert
  to authenticated with check (organization_id = current_org_id());

drop policy if exists "cp_update" on contact_points;
create policy "cp_update" on contact_points for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

drop policy if exists "cp_delete" on contact_points;
create policy "cp_delete" on contact_points for delete
  to authenticated using (organization_id = current_org_id());

-- ==========================================================================
-- Revenue Identity mailbox + policy
-- ==========================================================================

create table if not exists email_mailboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  provider text not null default 'relay_noop',
  sender_email text not null,
  sender_name text not null,
  signature text,
  status text not null default 'DISCONNECTED' check (status in ('CONNECTED', 'DISCONNECTED', 'ERROR')),
  secrets_ciphertext jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (revenue_identity_id)
);

create index if not exists emb_org_idx on email_mailboxes (organization_id);
create index if not exists emb_org_status_idx on email_mailboxes (organization_id, status);

alter table email_mailboxes enable row level security;

drop policy if exists "emb_select" on email_mailboxes;
create policy "emb_select" on email_mailboxes for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "emb_insert" on email_mailboxes;
create policy "emb_insert" on email_mailboxes for insert
  to authenticated with check (organization_id = current_org_id());

drop policy if exists "emb_update" on email_mailboxes;
create policy "emb_update" on email_mailboxes for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

drop policy if exists "emb_delete" on email_mailboxes;
create policy "emb_delete" on email_mailboxes for delete
  to authenticated using (organization_id = current_org_id());

create table if not exists email_sending_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  revenue_identity_id uuid references revenue_identities(id) on delete cascade,
  daily_send_cap int not null default 30,
  minimum_delay_seconds int not null default 30,
  working_hours_start int not null default 9,
  working_hours_end int not null default 17,
  timezone text not null default 'UTC',
  follow_up_limit int not null default 1,
  suppression_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, revenue_identity_id)
);

create index if not exists esp_org_idx on email_sending_policies (organization_id);

alter table email_sending_policies enable row level security;

drop policy if exists "esp_select" on email_sending_policies;
create policy "esp_select" on email_sending_policies for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "esp_insert" on email_sending_policies;
create policy "esp_insert" on email_sending_policies for insert
  to authenticated with check (organization_id = current_org_id());

drop policy if exists "esp_update" on email_sending_policies;
create policy "esp_update" on email_sending_policies for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

drop policy if exists "esp_delete" on email_sending_policies;
create policy "esp_delete" on email_sending_policies for delete
  to authenticated using (organization_id = current_org_id());

-- ==========================================================================
-- Reusable artifacts for outreach attachments/references
-- ==========================================================================

create table if not exists outreach_artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  artifact_type text not null check (artifact_type in (
    'CV', 'RESUME', 'PORTFOLIO', 'CASE_STUDY', 'PROJECT', 'CAPABILITY_DECK', 'PROPOSAL', 'OTHER'
  )),
  name text not null,
  description text,
  source_url text,
  tags text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists oa_org_idx on outreach_artifacts (organization_id);
create index if not exists oa_identity_idx on outreach_artifacts (revenue_identity_id);

alter table outreach_artifacts enable row level security;

drop policy if exists "oa_select" on outreach_artifacts;
create policy "oa_select" on outreach_artifacts for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "oa_insert" on outreach_artifacts;
create policy "oa_insert" on outreach_artifacts for insert
  to authenticated with check (organization_id = current_org_id());

drop policy if exists "oa_update" on outreach_artifacts;
create policy "oa_update" on outreach_artifacts for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

drop policy if exists "oa_delete" on outreach_artifacts;
create policy "oa_delete" on outreach_artifacts for delete
  to authenticated using (organization_id = current_org_id());

-- ==========================================================================
-- Prepared drafts and sent email metadata
-- ==========================================================================

create table if not exists prepared_email_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  contact_point_id uuid references contact_points(id) on delete set null,
  contact_email text,
  draft_status text not null default 'DRAFT' check (draft_status in (
    'DRAFT', 'RESEARCH_REQUIRED', 'CONTACT_NOT_FOUND', 'SKIP', 'READY', 'SENT', 'FAILED'
  )),
  relationship_type text,
  opportunity_type text,
  email_goal text,
  subject text,
  subject_candidates text[] not null default '{}',
  body text,
  strategy jsonb,
  research_brief jsonb,
  claim_safety jsonb,
  edit_disposition text check (edit_disposition in ('UNCHANGED', 'LIGHT_EDIT', 'HEAVY_EDIT', 'REJECTED')),
  evidence_used text[] not null default '{}',
  blocked_reason text,
  is_followup boolean not null default false,
  followup_sequence int not null default 0,
  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ped_org_idx on prepared_email_drafts (organization_id);
create index if not exists ped_org_status_idx on prepared_email_drafts (organization_id, draft_status);
create index if not exists ped_org_lead_idx on prepared_email_drafts (organization_id, lead_id);
create index if not exists ped_identity_idx on prepared_email_drafts (organization_id, revenue_identity_id);

alter table prepared_email_drafts enable row level security;

drop policy if exists "ped_select" on prepared_email_drafts;
create policy "ped_select" on prepared_email_drafts for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "ped_insert" on prepared_email_drafts;
create policy "ped_insert" on prepared_email_drafts for insert
  to authenticated with check (organization_id = current_org_id());

drop policy if exists "ped_update" on prepared_email_drafts;
create policy "ped_update" on prepared_email_drafts for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

drop policy if exists "ped_delete" on prepared_email_drafts;
create policy "ped_delete" on prepared_email_drafts for delete
  to authenticated using (organization_id = current_org_id());

create table if not exists email_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  prepared_draft_id uuid references prepared_email_drafts(id) on delete set null,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  mailbox_id uuid not null references email_mailboxes(id) on delete restrict,
  contact_point_id uuid references contact_points(id) on delete set null,
  direction text not null default 'OUTBOUND' check (direction in ('OUTBOUND', 'INBOUND')),
  category text not null default 'FIRST_EMAIL' check (category in ('FIRST_EMAIL', 'FOLLOW_UP', 'REPLY')),
  idempotency_key text not null,
  subject text not null,
  body text not null,
  provider text not null,
  provider_message_id text,
  provider_thread_id text,
  delivery_status text not null default 'SENT' check (delivery_status in (
    'DRAFT', 'QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'REPLIED', 'SUPPRESSED'
  )),
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  replied_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  unique (organization_id, provider, provider_message_id)
);

create index if not exists em_org_idx on email_messages (organization_id);
create index if not exists em_org_lead_idx on email_messages (organization_id, lead_id);
create index if not exists em_org_status_idx on email_messages (organization_id, delivery_status);
create index if not exists em_org_thread_idx on email_messages (organization_id, provider_thread_id);
create index if not exists em_org_identity_idx on email_messages (organization_id, revenue_identity_id);

alter table email_messages enable row level security;

drop policy if exists "em_select" on email_messages;
create policy "em_select" on email_messages for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "em_insert" on email_messages;
create policy "em_insert" on email_messages for insert
  to authenticated with check (organization_id = current_org_id());

drop policy if exists "em_update" on email_messages;
create policy "em_update" on email_messages for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

drop policy if exists "em_delete" on email_messages;
create policy "em_delete" on email_messages for delete
  to authenticated using (organization_id = current_org_id());

create table if not exists email_send_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  prepared_draft_id uuid references prepared_email_drafts(id) on delete set null,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED')),
  email_message_id uuid references email_messages(id) on delete set null,
  provider_message_id text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create index if not exists esa_org_idx on email_send_attempts (organization_id);
create index if not exists esa_org_status_idx on email_send_attempts (organization_id, status);

alter table email_send_attempts enable row level security;

drop policy if exists "esa_select" on email_send_attempts;
create policy "esa_select" on email_send_attempts for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "esa_insert" on email_send_attempts;
create policy "esa_insert" on email_send_attempts for insert
  to authenticated with check (organization_id = current_org_id());

drop policy if exists "esa_update" on email_send_attempts;
create policy "esa_update" on email_send_attempts for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

drop policy if exists "esa_delete" on email_send_attempts;
create policy "esa_delete" on email_send_attempts for delete
  to authenticated using (organization_id = current_org_id());

create table if not exists email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email_message_id uuid not null references email_messages(id) on delete cascade,
  provider_event_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, provider_event_id)
);

create index if not exists ede_org_idx on email_delivery_events (organization_id);
create index if not exists ede_org_message_idx on email_delivery_events (organization_id, email_message_id);

alter table email_delivery_events enable row level security;

drop policy if exists "ede_select" on email_delivery_events;
create policy "ede_select" on email_delivery_events for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "ede_insert" on email_delivery_events;
create policy "ede_insert" on email_delivery_events for insert
  to authenticated with check (organization_id = current_org_id());

drop policy if exists "ede_update" on email_delivery_events;
create policy "ede_update" on email_delivery_events for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

drop policy if exists "ede_delete" on email_delivery_events;
create policy "ede_delete" on email_delivery_events for delete
  to authenticated using (organization_id = current_org_id());

create table if not exists email_suppressions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  contact_point_id uuid references contact_points(id) on delete set null,
  email text not null,
  email_key text generated always as (lower(trim(email))) stored,
  reason text not null check (reason in ('UNSUBSCRIBE', 'DO_NOT_CONTACT', 'BOUNCE', 'INVALID', 'PROVIDER_REJECTION', 'MANUAL')),
  active boolean not null default true,
  source text not null default 'system',
  notes text,
  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, email_key, reason, active)
);

create index if not exists es_org_idx on email_suppressions (organization_id);
create index if not exists es_org_email_idx on email_suppressions (organization_id, email_key);

alter table email_suppressions enable row level security;

drop policy if exists "es_select" on email_suppressions;
create policy "es_select" on email_suppressions for select
  to authenticated using (organization_id = current_org_id());

drop policy if exists "es_insert" on email_suppressions;
create policy "es_insert" on email_suppressions for insert
  to authenticated with check (organization_id = current_org_id());

drop policy if exists "es_update" on email_suppressions;
create policy "es_update" on email_suppressions for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

drop policy if exists "es_delete" on email_suppressions;
create policy "es_delete" on email_suppressions for delete
  to authenticated using (organization_id = current_org_id());
