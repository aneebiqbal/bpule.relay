-- 0085: Revenue Identity OS — daily targets, accountability, notifications, audit
--
-- Extends the revenue_identities schema (0043) with the operational layer:
-- configurable daily targets per rep+identity+activity, deterministic
-- accountability tracking, immutable audit log, and deduplicated notifications.
--
-- All tables are tenant-scoped via organization_id and enforce RLS with
-- admin-write/rep-read-within-org policies consistent with migration 021+.

-- ============================================================================
-- WORKING DAYS + TIMEZONE on organizations
-- ============================================================================

alter table organizations add column if not exists timezone text not null default 'UTC';
alter table organizations add column if not exists working_days int[] not null default '{1,2,3,4,5}';
alter table organizations add column if not exists holidays jsonb not null default '[]'::jsonb;

-- ============================================================================
-- DAILY TARGETS
-- Configured by admin per rep + revenue identity + activity type.
-- ============================================================================

create table if not exists daily_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  activity_type text not null,
  target_count int not null check (target_count > 0),
  active boolean not null default true,
  created_by uuid references reps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rep_id, revenue_identity_id, activity_type)
);
create index if not exists dt_org_idx on daily_targets (organization_id);
create index if not exists dt_rep_idx on daily_targets (rep_id);
create index if not exists dt_identity_idx on daily_targets (revenue_identity_id);
alter table daily_targets enable row level security;
drop policy if exists "dt_select" on daily_targets;
create policy "dt_select" on daily_targets for select using (organization_id = current_org_id());
drop policy if exists "dt_insert" on daily_targets;
create policy "dt_insert" on daily_targets for insert with check (organization_id = current_org_id() and is_org_admin());
drop policy if exists "dt_update" on daily_targets;
create policy "dt_update" on daily_targets for update using (organization_id = current_org_id() and is_org_admin()) with check (organization_id = current_org_id() and is_org_admin());
drop policy if exists "dt_delete" on daily_targets;
create policy "dt_delete" on daily_targets for delete using (organization_id = current_org_id() and is_org_admin());

-- ============================================================================
-- DAILY ACCOUNTABILITY
-- One row per rep + identity + activity + working day. Immutable once closed.
-- ============================================================================

create table if not exists daily_accountability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,
  revenue_identity_id uuid not null references revenue_identities(id) on delete cascade,
  activity_type text not null,
  target_date date not null,
  target_count int not null,
  completed_count int not null default 0,
  status text not null default 'on_track' check (status in ('on_track', 'at_risk', 'completed', 'missed')),
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rep_id, revenue_identity_id, activity_type, target_date)
);
create index if not exists da_org_date_idx on daily_accountability (organization_id, target_date desc);
create index if not exists da_rep_date_idx on daily_accountability (rep_id, target_date desc);
create index if not exists da_identity_idx on daily_accountability (revenue_identity_id);
create index if not exists da_status_idx on daily_accountability (organization_id, status);
alter table daily_accountability enable row level security;
drop policy if exists "da_select" on daily_accountability;
create policy "da_select" on daily_accountability for select using (
  organization_id = current_org_id()
  and (rep_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin())
);
drop policy if exists "da_insert" on daily_accountability;
create policy "da_insert" on daily_accountability for insert with check (organization_id = current_org_id());
drop policy if exists "da_update" on daily_accountability;
create policy "da_update" on daily_accountability for update using (organization_id = current_org_id()) with check (organization_id = current_org_id());

-- ============================================================================
-- ACCOUNTABILITY AUDIT LOG
-- Immutable record of every accountability-relevant event.
-- ============================================================================

create table if not exists accountability_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid references reps(id) on delete set null,
  revenue_identity_id uuid references revenue_identities(id) on delete set null,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists aal_org_time_idx on accountability_audit_log (organization_id, created_at desc);
create index if not exists aal_rep_idx on accountability_audit_log (rep_id);
alter table accountability_audit_log enable row level security;
drop policy if exists "aal_select" on accountability_audit_log;
create policy "aal_select" on accountability_audit_log for select using (
  organization_id = current_org_id()
  and (rep_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin())
);
drop policy if exists "aal_insert" on accountability_audit_log;
create policy "aal_insert" on accountability_audit_log for insert with check (organization_id = current_org_id());

-- ============================================================================
-- NOTIFICATIONS
-- Deduplicated, actionable notifications for reps and admins.
-- ============================================================================

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  recipient_id uuid not null references reps(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  link text,
  dedupe_key text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notif_recipient_idx on notifications (recipient_id, created_at desc);
create index if not exists notif_dedupe_idx on notifications (organization_id, recipient_id, dedupe_key);
create index if not exists notif_unread_idx on notifications (recipient_id, read) where read = false;
alter table notifications enable row level security;
drop policy if exists "notif_select" on notifications;
create policy "notif_select" on notifications for select using (
  organization_id = current_org_id()
  and (recipient_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin())
);
drop policy if exists "notif_insert" on notifications;
create policy "notif_insert" on notifications for insert with check (organization_id = current_org_id());
drop policy if exists "notif_update" on notifications;
create policy "notif_update" on notifications for update using (
  organization_id = current_org_id()
  and recipient_id in (select id from reps where auth_user_id = auth.uid())
) with check (organization_id = current_org_id());

-- ============================================================================
-- HELPER FUNCTION: is_org_working_day
-- Returns true if the given date is a working day for the organization.
-- ============================================================================

create or replace function public.is_org_working_day(
  p_org_id uuid,
  p_date date
) returns boolean
language sql stable security definer set search_path = public as
$$
  select
    coalesce(
      (
        select extract(dow from p_date)::int = any(o.working_days)
        from organizations o
        where o.id = p_org_id
      ),
      false
    )
    and not exists (
      select 1
      from organizations o,
      jsonb_array_elements(o.holidays) h
      where o.id = p_org_id
        and (h->>'date')::date = p_date
    );
$$;

-- ============================================================================
-- HELPER FUNCTION: current_rep_id_v2
-- Same as current_rep_id() but uses the newer naming convention.
-- Kept for clarity in new policies.
-- ============================================================================

create or replace function public.current_rep_id_v2() returns uuid
language sql stable security definer set search_path = public as
$$
  select r.id from reps r where r.auth_user_id = auth.uid();
$$;

-- ============================================================================
-- TRIGGER: Auto-create daily accountability rows when a target is set
-- ============================================================================

create or replace function public.ensure_daily_accountability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
begin
  -- Create accountability row for today if it's a working day
  v_date := current_date;
  if public.is_org_working_day(NEW.organization_id, v_date) then
    insert into daily_accountability (
      organization_id, rep_id, revenue_identity_id, activity_type,
      target_date, target_count, completed_count, status, closed
    ) values (
      NEW.organization_id, NEW.rep_id, NEW.revenue_identity_id, NEW.activity_type,
      v_date, NEW.target_count, 0, 'on_track', false
    )
    on conflict (rep_id, revenue_identity_id, activity_type, target_date)
    do update set
      target_count = NEW.target_count,
      updated_at = now()
    where daily_accountability.closed = false;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_ensure_daily_accountability on daily_targets;
create trigger trg_ensure_daily_accountability
  after insert or update on daily_targets
  for each row
  when (NEW.active = true)
  execute function public.ensure_daily_accountability();

-- ============================================================================
-- RPC: record_activity_event
-- Atomically increments completed_count for a rep+identity+activity+today.
-- Returns the new accountability row. Used by store layer after canonical events.
-- ============================================================================

create or replace function public.record_activity_event(
  p_rep_id uuid,
  p_identity_id uuid,
  p_activity_type text,
  p_org_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
  v_target_count int;
  v_completed int;
  v_status text;
  v_existing_id uuid;
  v_is_working boolean;
begin
  v_date := current_date;
  v_is_working := public.is_org_working_day(p_org_id, v_date);

  if not v_is_working then
    return json_build_object('recorded', false, 'reason', 'not_working_day');
  end if;

  -- Get target count for this rep+identity+activity
  select coalesce(
    (select target_count from daily_targets
     where rep_id = p_rep_id
       and revenue_identity_id = p_identity_id
       and activity_type = p_activity_type
       and active = true
     limit 1),
    0
  ) into v_target_count;

  -- Upsert accountability row
  insert into daily_accountability (
    organization_id, rep_id, revenue_identity_id, activity_type,
    target_date, target_count, completed_count, status, closed
  ) values (
    p_org_id, p_rep_id, p_identity_id, p_activity_type,
    v_date, v_target_count, 1, 'on_track', false
  )
  on conflict (rep_id, revenue_identity_id, activity_type, target_date)
  do update set
    completed_count = daily_accountability.completed_count + 1,
    updated_at = now()
  where daily_accountability.closed = false
  returning id, completed_count, target_count into v_existing_id, v_completed, v_target_count;

  -- Compute status
  if v_completed >= v_target_count and v_target_count > 0 then
    v_status := 'completed';
  else
    v_status := 'on_track';
  end if;

  update daily_accountability set status = v_status where id = v_existing_id;

  return json_build_object(
    'recorded', true,
    'completed_count', v_completed,
    'target_count', v_target_count,
    'status', v_status
  );
end;
$$;
