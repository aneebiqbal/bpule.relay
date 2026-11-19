-- Job Intelligence v3 — curated ATS boards + per-source HTTP timeouts.
--
-- RemoteOK's public API regularly takes 15-20 s; the previous global 8 s
-- timeout produced false failures. Each source can now carry its own timeout.
-- Curated boards are seeded disabled; an admin enables the ones they approve.

update job_sources
set config = config || '{"timeout_ms": 25000}'::jsonb
where id in ('remoteok', 'remotive');

insert into job_sources (id, name, kind, base_url, config, enabled, interval_secs) values
  ('greenhouse-airbnb', 'Greenhouse · Airbnb', 'ats', 'https://boards-api.greenhouse.io/v1/boards',
   '{"adapter":"greenhouse","slug":"airbnb","company":"Airbnb","timeout_ms":25000}'::jsonb, false, 86400),
  ('greenhouse-stripe', 'Greenhouse · Stripe', 'ats', 'https://boards-api.greenhouse.io/v1/boards',
   '{"adapter":"greenhouse","slug":"stripe","company":"Stripe","timeout_ms":25000}'::jsonb, false, 86400),
  ('ashby-ramp', 'Ashby · Ramp', 'ats', 'https://api.ashbyhq.com/posting-api/job-board',
   '{"adapter":"ashby","slug":"ramp","company":"Ramp","timeout_ms":30000}'::jsonb, false, 86400),
  ('ashby-linear', 'Ashby · Linear', 'ats', 'https://api.ashbyhq.com/posting-api/job-board',
   '{"adapter":"ashby","slug":"linear","company":"Linear","timeout_ms":30000}'::jsonb, false, 86400)
on conflict (id) do nothing;
