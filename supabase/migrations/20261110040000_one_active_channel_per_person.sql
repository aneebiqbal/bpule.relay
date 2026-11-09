-- One active channel identity per person + channel.
--
-- The directory groups sender accounts by `profiles.person_id`, so the unique
-- key must be the canonical person (`person_id ?? id`), not the individual
-- sender-account row. `revenue_identities.person_key` carries that key and is
-- maintained by triggers on both tables.

alter table public.revenue_identities add column if not exists person_key uuid;

update public.revenue_identities ri
   set person_key = coalesce(p.person_id, p.id)
  from public.profiles p
 where p.id = ri.profile_id
   and ri.person_key is null;

create unique index if not exists ri_one_active_person_channel_idx
  on public.revenue_identities (person_key, channel)
 where status = 'active';

create or replace function public.revenue_identities_sync_person_key()
returns trigger
language plpgsql
as $$
begin
  select coalesce(p.person_id, p.id) into new.person_key
    from public.profiles p
   where p.id = new.profile_id;
  return new;
end;
$$;

drop trigger if exists ri_sync_person_key on public.revenue_identities;
create trigger ri_sync_person_key
  before insert or update of profile_id on public.revenue_identities
  for each row execute function public.revenue_identities_sync_person_key();

-- Keep existing identities in sync when a person mapping changes.
create or replace function public.profiles_sync_identity_person_key()
returns trigger
language plpgsql
as $$
begin
  if new.person_id is distinct from old.person_id then
    update public.revenue_identities
       set person_key = coalesce(new.person_id, new.id)
     where profile_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_identity_person_key on public.profiles;
create trigger profiles_sync_identity_person_key
  after update of person_id on public.profiles
  for each row execute function public.profiles_sync_identity_person_key();
