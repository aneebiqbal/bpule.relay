-- 0012: Seed profile aliases without touching reps.
--
-- If a target name exists in reps, attach the profile to that rep.
-- If it does not exist, attach the profile to Aneeb so these identities can
-- still be used operationally without creating any reps rows.

do $$
declare
  target record;
  target_rep_id uuid;
  owner_rep_id uuid;
  inserted_count int;
  fallback_owner_name constant text := 'Aneeb';
  missing_target_names text[] := '{}';
begin
  select id into owner_rep_id from reps where name = fallback_owner_name limit 1;
  if owner_rep_id is null then
    raise exception 'Fallback owner % not found in reps. Cannot seed alias profiles safely.', fallback_owner_name;
  end if;

  for target in
    select *
    from (values
      ('Fizza'::text, 'upwork'::text, 'Fizza, Upwork'::text),
      ('Fizza'::text, 'linkedin'::text, 'Fizza, LinkedIn'::text),
      ('Mehak'::text, 'upwork'::text, 'Mehak, Upwork'::text),
      ('Mehak'::text, 'linkedin'::text, 'Mehak, LinkedIn'::text),
      ('Zaira'::text, 'upwork'::text, 'Zaira, Upwork'::text),
      ('Aneeb'::text, 'upwork'::text, 'Aneeb, Upwork'::text),
      ('Aneeb'::text, 'linkedin'::text, 'Aneeb, LinkedIn'::text)
    ) as v(rep_name, platform, label)
  loop
    select r.id
    into target_rep_id
    from reps r
    where r.name = target.rep_name
    limit 1;

    if target_rep_id is null then
      if not (target.rep_name = any(missing_target_names)) then
        missing_target_names := array_append(missing_target_names, target.rep_name);
      end if;
      target_rep_id := owner_rep_id;
    end if;

    insert into profiles (rep_id, platform, label)
    select target_rep_id, target.platform, target.label
    where not exists (
      select 1
      from profiles p
      where p.rep_id = target_rep_id
        and p.platform = target.platform
        and coalesce(p.label, '') = target.label
    );

    get diagnostics inserted_count = row_count;
    if inserted_count = 1 then
      raise notice 'INSERTED profile: label=% platform=% owner_rep_id=%', target.label, target.platform, target_rep_id;
    else
      raise notice 'ALREADY_PRESENT profile: label=% platform=% owner_rep_id=%', target.label, target.platform, target_rep_id;
    end if;
  end loop;

  if coalesce(array_length(missing_target_names, 1), 0) > 0 then
    raise warning 'TARGET_NAMES_NOT_IN_REPS (attached to %): %', fallback_owner_name, array_to_string(missing_target_names, ', ');
  end if;
end;
$$ language plpgsql;
