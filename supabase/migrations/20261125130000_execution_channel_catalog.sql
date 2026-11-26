-- RELAY unified operations — canonical execution channel + activity catalog.
--
-- Additive. The existing canonical systems stay untouched:
--   * daily_target_plans.activity_type keeps its stored strings. Built-in
--     canonical activity KEYS are deliberately equal to those legacy strings,
--     so no historical lane is rewritten or reinterpreted.
--   * revenue_identities.channel keeps its enum meaning. A new nullable
--     channel_id adds an explicit canonical reference for custom channels;
--     resolution prefers channel_id and falls back to the enum.
--
-- System templates have organization_id NULL and are readable by every org.
-- Custom channels are org-scoped rows with template 'custom'.

create table if not exists execution_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  template text not null check (template in ('linkedin', 'upwork', 'email', 'direct_replies', 'custom')),
  operation_mode text not null default 'manual_evidence'
    check (operation_mode in ('manual_evidence', 'relay_native', 'connected_provider', 'import_webhook')),
  enabled boolean not null default true,
  -- Supported identity requirements: validated shape, never executable code.
  identity_requirements jsonb not null default '{"identity_required":true}'::jsonb,
  revision integer not null default 1,
  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists execution_channels_org_slug_idx
  on execution_channels (organization_id, slug);
create unique index if not exists execution_channels_system_slug_idx
  on execution_channels (slug) where organization_id is null;

alter table execution_channels enable row level security;

drop policy if exists "ec_select" on execution_channels;
create policy "ec_select" on execution_channels
  for select to authenticated using (organization_id is null or organization_id = current_org_id());

drop policy if exists "ec_insert" on execution_channels;
create policy "ec_insert" on execution_channels
  for insert to authenticated with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "ec_update" on execution_channels;
create policy "ec_update" on execution_channels
  for update to authenticated
  using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "ec_delete" on execution_channels;
create policy "ec_delete" on execution_channels
  for delete to authenticated using (organization_id = current_org_id() and is_org_admin());

create table if not exists execution_activity_definitions (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references execution_channels(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  key text not null,
  label text not null,
  description text,
  counting_mode text not null default 'unique_verified_event'
    check (counting_mode in (
      'unique_verified_event', 'distinct_prospect', 'distinct_conversation',
      'completed_task', 'approved_manual_external'
    )),
  evidence_policy text not null default 'internal_record'
    check (evidence_policy in (
      'provider_event_id', 'source_event_id', 'internal_record',
      'human_confirmation', 'approved_reference', 'reviewer_approval'
    )),
  targetable boolean not null default false,
  enabled boolean not null default true,
  effort_minutes integer not null default 0 check (effort_minutes >= 0),
  recording_modes text[] not null default '{}',
  duplicate_policy text not null default 'idempotent_source_event',
  outcome_class text,
  version integer not null default 1,
  effective_from date not null default current_date,
  effective_until date,
  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One CURRENT definition per channel/key. Superseded versions keep their row
-- with effective_until set, so historical reports are never reinterpreted.
create unique index if not exists ead_channel_current_key_idx
  on execution_activity_definitions (channel_id, key)
  where effective_until is null;
create index if not exists ead_channel_enabled_idx
  on execution_activity_definitions (channel_id, enabled);
create index if not exists ead_org_idx on execution_activity_definitions (organization_id);

alter table execution_activity_definitions enable row level security;

drop policy if exists "ead_select" on execution_activity_definitions;
create policy "ead_select" on execution_activity_definitions
  for select to authenticated using (
    organization_id is null
    or exists (
      select 1 from execution_channels c
      where c.id = execution_activity_definitions.channel_id
        and c.organization_id = current_org_id()
    )
  );

drop policy if exists "ead_insert" on execution_activity_definitions;
create policy "ead_insert" on execution_activity_definitions
  for insert to authenticated with check (
    organization_id = current_org_id() and is_org_admin()
  );

drop policy if exists "ead_update" on execution_activity_definitions;
create policy "ead_update" on execution_activity_definitions
  for update to authenticated
  using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

drop policy if exists "ead_delete" on execution_activity_definitions;
create policy "ead_delete" on execution_activity_definitions
  for delete to authenticated using (organization_id = current_org_id() and is_org_admin());

-- Legacy / registry keys → canonical activity key, scoped per channel so the
-- same legacy word can mean different things on different channels.
create table if not exists execution_activity_aliases (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references execution_channels(id) on delete cascade,
  activity_definition_id uuid not null references execution_activity_definitions(id) on delete cascade,
  alias_key text not null,
  created_at timestamptz not null default now(),
  unique (channel_id, alias_key)
);

create index if not exists eaa_definition_idx on execution_activity_aliases (activity_definition_id);

alter table execution_activity_aliases enable row level security;

drop policy if exists "eaa_select" on execution_activity_aliases;
create policy "eaa_select" on execution_activity_aliases
  for select to authenticated using (
    exists (
      select 1 from execution_channels c
      where c.id = execution_activity_aliases.channel_id
        and (c.organization_id is null or c.organization_id = current_org_id())
    )
  );

-- Explicit canonical channel reference on an identity. NULL means "use the
-- legacy channel enum". Never overwrite revenue_identities.channel.
alter table revenue_identities add column if not exists channel_id uuid
  references execution_channels(id) on delete set null;
create index if not exists ri_channel_id_idx on revenue_identities (channel_id);

-- ── Built-in templates ──────────────────────────────────────────────────────
insert into execution_channels (organization_id, slug, name, description, template, operation_mode, enabled)
values
  (null, 'linkedin', 'LinkedIn', 'LinkedIn outreach through an assigned profile identity.', 'linkedin', 'manual_evidence', true),
  (null, 'upwork', 'Upwork', 'Upwork proposals and applications through an assigned identity.', 'upwork', 'manual_evidence', true),
  (null, 'email', 'Email', 'Verified business email outreach and replies.', 'email', 'manual_evidence', true),
  (null, 'direct-replies', 'Direct Replies', 'Incoming conversations reviewed and answered inside Relay.', 'direct_replies', 'relay_native', true),
  -- Keeps the historical untargeted "other" lane resolvable without inventing
  -- a silent fallback at the resolver boundary.
  (null, 'general', 'General', 'Legacy untargeted activity bucket.', 'custom', 'manual_evidence', true)
on conflict do nothing;

insert into execution_activity_definitions
  (channel_id, organization_id, key, label, description, counting_mode, evidence_policy, targetable, enabled, effort_minutes, recording_modes, outcome_class)
select c.id, null, v.key, v.label, v.description, v.counting_mode, v.evidence_policy, v.targetable, true, v.effort_minutes, v.recording_modes::text[], v.outcome_class
from execution_channels c
join (values
  ('linkedin', 'connection_request', 'Connection invitations', 'One invitation verified sent to a distinct prospect.', 'unique_verified_event', 'source_event_id', true, 1, '{manual}', 'outreach'),
  ('linkedin', 'dm', 'Direct messages', 'One DM verified sent to a distinct conversation.', 'distinct_conversation', 'source_event_id', true, 2, '{manual}', 'outreach'),
  ('linkedin', 'followup', 'Follow-ups', 'One completed eligible follow-up.', 'unique_verified_event', 'source_event_id', true, 2, '{manual}', 'outreach'),
  ('linkedin', 'prospect_extracted', 'Prospects captured', 'One unique prospect persisted.', 'distinct_prospect', 'internal_record', true, 1, '{manual}', 'research'),
  ('linkedin', 'reply_handled', 'Replies handled', 'One inbound reply reviewed and actioned.', 'unique_verified_event', 'human_confirmation', false, 2, '{manual}', 'outcome'),
  ('upwork', 'application', 'Applications submitted', 'One application confirmed submitted externally.', 'approved_manual_external', 'human_confirmation', true, 20, '{manual}', 'execution'),
  ('upwork', 'proposal', 'Proposals prepared', 'One proposal draft prepared. Never a submitted application.', 'completed_task', 'internal_record', false, 30, '{manual}', 'preparation'),
  ('email', 'email', 'Emails sent', 'One email verified sent to a distinct contact.', 'unique_verified_event', 'provider_event_id', true, 3, '{manual}', 'outreach'),
  ('email', 'followup', 'Email follow-ups', 'One completed email follow-up.', 'unique_verified_event', 'provider_event_id', true, 2, '{manual}', 'outreach'),
  ('email', 'prospect_extracted', 'Prospects captured', 'One unique email lead persisted.', 'distinct_prospect', 'internal_record', true, 1, '{manual}', 'research'),
  ('email', 'email_reply_handled', 'Email replies handled', 'One inbound email reply reviewed and actioned.', 'unique_verified_event', 'human_confirmation', false, 2, '{manual}', 'outcome'),
  ('direct-replies', 'reply_drafted', 'Reply drafted', 'One reply draft prepared for review.', 'completed_task', 'internal_record', true, 3, '{relay_native}', 'preparation'),
  ('direct-replies', 'reply_confirmed_sent', 'Reply confirmed sent', 'One reply confirmed sent through Relay.', 'unique_verified_event', 'internal_record', true, 2, '{relay_native}', 'execution'),
  ('direct-replies', 'conversation_resolved', 'Conversation resolved', 'One conversation resolved.', 'distinct_conversation', 'human_confirmation', true, 1, '{relay_native}', 'outcome'),
  ('direct-replies', 'followup_scheduled', 'Follow-up scheduled', 'One follow-up scheduled for a conversation.', 'completed_task', 'internal_record', false, 1, '{relay_native}', 'planning'),
  ('general', 'other', 'Other', 'Untargeted legacy activity. Tracked, never a requirement.', 'unique_verified_event', 'internal_record', false, 0, '{manual}', null)
) as v(channel_slug, key, label, description, counting_mode, evidence_policy, targetable, effort_minutes, recording_modes, outcome_class)
  on c.slug = v.channel_slug
where c.organization_id is null
on conflict do nothing;

insert into execution_activity_aliases (channel_id, activity_definition_id, alias_key)
select d.channel_id, d.id, a.alias_key
from execution_activity_definitions d
join (values
  ('connection_request', 'linkedin', 'connection_sent'),
  ('dm', 'linkedin', 'dm_sent'),
  ('followup', 'linkedin', 'followup_sent'),
  ('application', 'upwork', 'application_submitted'),
  ('proposal', 'upwork', 'proposal_generated'),
  ('email', 'email', 'email_sent'),
  ('followup', 'email', 'email_followup_sent'),
  ('email_reply_handled', 'email', 'email_reply_handled')
) as a(key, channel_slug, alias_key)
  on d.key = a.key
join execution_channels c on c.id = d.channel_id and c.slug = a.channel_slug
where d.organization_id is null
on conflict do nothing;

comment on table execution_channels is
  'Canonical execution channel definitions. NULL organization_id = built-in template; custom channels are org-scoped.';
comment on table execution_activity_definitions is
  'Canonical measurable activity. KEY is immutable and materializes into daily_target_plans.activity_type, so planning/ledger/reporting work unchanged.';
comment on table execution_activity_aliases is
  'Legacy/registry key → canonical activity, scoped per channel. Unknown keys never fall back to "other".';
