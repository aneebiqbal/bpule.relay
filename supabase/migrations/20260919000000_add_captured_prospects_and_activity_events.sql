create table if not exists captured_prospects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_rep_id uuid not null references reps(id) on delete cascade,
  raw_input text not null,
  extracted_name text,
  extracted_company text,
  extracted_title text,
  extracted_location text,
  linkedin_url text,
  company_url text,
  canonical_score integer,
  canonical_intelligence jsonb,
  score_breakdown jsonb,
  revenue_identity_id uuid references revenue_identities(id) on delete set null,
  sender_profile_id text,
  status text not null default 'captured' check (status in ('captured', 'converted', 'discarded')),
  converted_lead_id uuid references leads(id) on delete set null,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cp_org_idx on captured_prospects (organization_id);
create index if not exists cp_rep_idx on captured_prospects (owner_rep_id);
create index if not exists cp_status_idx on captured_prospects (status);

alter table captured_prospects enable row level security;

drop policy if exists "cp_select" on captured_prospects;
create policy "cp_select" on captured_prospects for select using (organization_id = current_org_id());

drop policy if exists "cp_insert" on captured_prospects;
create policy "cp_insert" on captured_prospects for insert with check (organization_id = current_org_id());

drop policy if exists "cp_update" on captured_prospects;
create policy "cp_update" on captured_prospects for update using (organization_id = current_org_id());

comment on table captured_prospects is 'Prospects captured from extraction but not yet saved as Leads. Promoted to leads on Save.';
