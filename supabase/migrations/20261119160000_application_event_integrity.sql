-- Application transition audit integrity.
--
-- Every status change must leave exactly one event, atomically with the
-- application row update, and a retry must not create a second event.
-- A trigger makes the event atomic; a dedupe key makes retries idempotent.

alter table application_events add column if not exists dedupe_key text;
create unique index if not exists application_events_dedupe_uniq
  on application_events (dedupe_key)
  where dedupe_key is not null;

create or replace function public.log_application_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into application_events
      (application_id, organization_id, from_status, to_status, actor_id, note, dedupe_key)
    values
      (new.id, new.organization_id, null, new.status, new.rep_id,
       case when new.status = 'applied' then 'Confirmed by human' else '' end,
       new.id || ':null:' || new.status || ':' || coalesce(new.rep_id::text, 'null'))
    on conflict (dedupe_key) do nothing;
  elsif old.status is distinct from new.status then
    insert into application_events
      (application_id, organization_id, from_status, to_status, actor_id, note, dedupe_key)
    values
      (new.id, new.organization_id, old.status, new.status, new.rep_id,
       case when new.status = 'applied' then 'Confirmed by human' else '' end,
       new.id || ':' || coalesce(old.status, 'null') || ':' || new.status || ':' || coalesce(new.rep_id::text, 'null'))
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists applications_transition_log on applications;
create trigger applications_transition_log
  after insert or update on applications
  for each row execute function public.log_application_transition();
