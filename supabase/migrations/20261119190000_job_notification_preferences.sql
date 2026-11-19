-- Per-operator job notification preferences. A missing row means "enabled".
create table if not exists job_notification_preferences (
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  new_matches boolean not null default true,
  saved_reminders boolean not null default true,
  application_followups boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, rep_id)
);

alter table job_notification_preferences enable row level security;
drop policy if exists job_notification_preferences_select on job_notification_preferences;
create policy job_notification_preferences_select on job_notification_preferences for select to authenticated, service_role
  using (organization_id = current_org_id());
drop policy if exists job_notification_preferences_insert on job_notification_preferences;
create policy job_notification_preferences_insert on job_notification_preferences for insert to authenticated, service_role
  with check (organization_id = current_org_id());
drop policy if exists job_notification_preferences_update on job_notification_preferences;
create policy job_notification_preferences_update on job_notification_preferences for update to authenticated, service_role
  using (organization_id = current_org_id()) with check (organization_id = current_org_id());
