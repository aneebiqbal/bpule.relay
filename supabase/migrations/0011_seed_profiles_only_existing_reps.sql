-- 0011: Seed profile identities for existing reps only.
--
-- This migration intentionally does not insert or update rows in reps.
-- It only inserts missing (rep_id, platform) rows in profiles for names that
-- already exist in reps.

do $$
declare
  target record;
  v_rep_id uuid;
  inserted_count int;
  missing_names text[] := '{}';
begin
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
    into v_rep_id
    from reps r
    where r.name = target.rep_name
    limit 1;

    if v_rep_id is null then
      if not (target.rep_name = any(missing_names)) then
        missing_names := array_append(missing_names, target.rep_name);
      end if;
      continue;
    end if;

    insert into profiles (rep_id, platform, label)
    select v_rep_id, target.platform, target.label
    where not exists (
      select 1
      from profiles p
      where p.rep_id = v_rep_id
        and p.platform = target.platform
    );

    get diagnostics inserted_count = row_count;
    if inserted_count = 1 then
      raise notice 'INSERTED profile: name=% platform=% label=%', target.rep_name, target.platform, target.label;
    else
      raise notice 'ALREADY_PRESENT profile: name=% platform=%', target.rep_name, target.platform;
    end if;
  end loop;

  if coalesce(array_length(missing_names, 1), 0) > 0 then
    raise warning 'MISSING_REPS (no rows inserted for these names): %', array_to_string(missing_names, ', ');
  else
    raise notice 'All target names were found in reps.';
  end if;
end;
$$ language plpgsql;
