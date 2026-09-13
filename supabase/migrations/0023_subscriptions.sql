-- 023: Subscription lifecycle tracking.
--
-- Tracks the real Stripe subscription state per organization. The organizations
-- plan column is the materialized view used for gating; this table is the
-- audit trail and the source of truth for webhook reconciliation.

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'incomplete'
    check (status in ('incomplete', 'active', 'past_due', 'canceled', 'unpaid', 'trialing')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index subscriptions_organization_idx on subscriptions (organization_id);
create index subscriptions_stripe_idx on subscriptions (stripe_subscription_id);

-- RLS: same org-scoped access as every other tenant table.
alter table subscriptions enable row level security;

create policy subscriptions_select on subscriptions for select
  to authenticated using (
    organization_id = (select r.organization_id from reps r where r.auth_user_id = auth.uid())
  );

create policy subscriptions_insert on subscriptions for insert
  to authenticated with check (
    organization_id = (select r.organization_id from reps r where r.auth_user_id = auth.uid())
    and (select r.role from reps r where r.auth_user_id = auth.uid()) = 'admin'
  );

create policy subscriptions_update on subscriptions for update
  to authenticated using (
    organization_id = (select r.organization_id from reps r where r.auth_user_id = auth.uid())
    and (select r.role from reps r where r.auth_user_id = auth.uid()) = 'admin'
  ) with check (
    organization_id = (select r.organization_id from reps r where r.auth_user_id = auth.uid())
    and (select r.role from reps r where r.auth_user_id = auth.uid()) = 'admin'
  );

-- No delete: subscriptions rows are retained for audit even after cancellation.
