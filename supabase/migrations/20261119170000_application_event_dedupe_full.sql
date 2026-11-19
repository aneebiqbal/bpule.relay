-- The partial unique index cannot be inferred by ON CONFLICT (dedupe_key).
-- Use a full unique index; the trigger always sets the key.
drop index if exists application_events_dedupe_uniq;
create unique index if not exists application_events_dedupe_uniq
  on application_events (dedupe_key);

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
