-- Additional permission-verified public feeds and larger ATS detail budgets.
insert into job_sources (id, name, kind, base_url, config, enabled, interval_secs) values
  ('himalayas', 'Himalayas', 'feed', 'https://himalayas.app/jobs/api',
   '{"limit":100}'::jsonb, true, 3600),
  ('jobicy', 'Jobicy', 'feed', 'https://jobicy.com/api/v2/remote-jobs',
   '{"count":100,"industry":"engineering"}'::jsonb, true, 3600),
  ('arbeitnow', 'Arbeitnow', 'feed', 'https://arbeitnow.com/api/job-board-api',
   '{"page":1}'::jsonb, false, 3600)
on conflict (id) do nothing;

update job_sources
set config = config || '{"detail_limit": 800}'::jsonb
where id in ('greenhouse-airbnb', 'greenhouse-stripe', 'ashby-ramp', 'ashby-linear');
