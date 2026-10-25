-- P0 security: intelligence_sample_events had RLS policies written but never
-- enabled, so any authenticated user could read every tenant's lifecycle
-- events (message text, client replies, outcomes). Confirmed by reading all
-- migrations: no `alter table ... enable row level security` exists for this
-- table, so the policies below were inert.
--
-- The events table carried no organization_id, so the org boundary is added
-- and backfilled from the parent sample, then the policies compare against
-- current_org_id() directly instead of relying on referenced-table RLS.

alter table intelligence_sample_events add column if not exists organization_id uuid;

update intelligence_sample_events e
  set organization_id = s.organization_id
  from intelligence_samples s
  where e.sample_id = s.id
    and e.organization_id is null;

create index if not exists int_sample_events_org_idx
  on intelligence_sample_events (organization_id);

-- New inserts (dataset sync, append_sample_event) should not have to know the
-- org; derive it from the parent sample.
create or replace function public.set_intelligence_sample_event_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    select organization_id into new.organization_id
      from intelligence_samples where id = new.sample_id;
  end if;
  return new;
end;
$$;

drop trigger if exists int_sample_events_set_org on intelligence_sample_events;
create trigger int_sample_events_set_org
  before insert on intelligence_sample_events
  for each row execute function public.set_intelligence_sample_event_org();

alter table intelligence_sample_events enable row level security;

drop policy if exists "int_events_org_read" on intelligence_sample_events;
drop policy if exists "int_events_org_insert" on intelligence_sample_events;

create policy int_events_org_read on intelligence_sample_events
  for select to authenticated
  using (organization_id = current_org_id());

create policy int_events_org_insert on intelligence_sample_events
  for insert to authenticated
  with check (organization_id = current_org_id());
