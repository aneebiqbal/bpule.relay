-- Create Upwork profile for Hassan if it doesn't exist
insert into profiles (id, rep_id, platform, label)
select '60000000-0000-0000-0000-000000000014', r.id, 'upwork', 'Hassan Upwork'
from reps r
where r.name = 'Hassan'
  and not exists (select 1 from profiles p where p.rep_id = r.id and p.platform = 'upwork')
on conflict (id) do nothing;
