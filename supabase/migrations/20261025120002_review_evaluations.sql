-- Human evaluation tables (message, thesis, routing) + revenue funnel export
-- views. Every row is org-scoped, reviewer-attributed and append-only; it never
-- overwrites the original message, thesis or routing decision.

create table if not exists message_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  message_id uuid not null,
  reviewer_rep_id uuid not null,
  score int not null check (score between 1 and 5),
  classification text not null check (classification in (
    'SALES_READY', 'GENERIC', 'MARKETING_NOT_SALES', 'UNSUPPORTED', 'FABRICATED', 'WRONG_STAGE'
  )),
  dimensions jsonb not null default '{}'::jsonb,
  reasons text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  unique (organization_id, message_id, reviewer_rep_id)
);
create index if not exists message_evals_org_idx on message_evaluations (organization_id, created_at desc);

create table if not exists thesis_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  reviewer_rep_id uuid not null,
  rating text not null check (rating in ('STRONG', 'USEFUL', 'WEAK', 'MISLEADING')),
  reasons text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  unique (organization_id, lead_id, reviewer_rep_id)
);
create index if not exists thesis_evals_org_idx on thesis_evaluations (organization_id, created_at desc);

create table if not exists routing_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  reviewer_rep_id uuid not null,
  best_sender_profile_id uuid,
  v1_correct boolean,
  v2_correct boolean,
  created_at timestamptz not null default now(),
  unique (organization_id, lead_id, reviewer_rep_id)
);
create index if not exists routing_evals_org_idx on routing_evaluations (organization_id, created_at desc);

alter table message_evaluations enable row level security;
alter table thesis_evaluations enable row level security;
alter table routing_evaluations enable row level security;

create policy message_evals_org_read on message_evaluations for select to authenticated using (organization_id = current_org_id());
create policy message_evals_org_insert on message_evaluations for insert to authenticated with check (organization_id = current_org_id());
create policy thesis_evals_org_read on thesis_evaluations for select to authenticated using (organization_id = current_org_id());
create policy thesis_evals_org_insert on thesis_evaluations for insert to authenticated with check (organization_id = current_org_id());
create policy routing_evals_org_read on routing_evaluations for select to authenticated using (organization_id = current_org_id());
create policy routing_evals_org_insert on routing_evaluations for insert to authenticated with check (organization_id = current_org_id());
