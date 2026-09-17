-- Add sender_profile_id and revenue_identity_id to leads table.
-- These columns link leads to the commercial identity used for outreach,
-- preventing cross-persona leakage between Revenue Identities.

alter table leads
  add column if not exists sender_profile_id text;

alter table leads
  add column if not exists revenue_identity_id uuid references revenue_identities(id) on delete set null;

create index if not exists leads_sender_profile_idx on leads (sender_profile_id) where sender_profile_id is not null;
create index if not exists leads_revenue_identity_idx on leads (revenue_identity_id) where revenue_identity_id is not null;
