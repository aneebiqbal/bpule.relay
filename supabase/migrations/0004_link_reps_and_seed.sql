-- Link the real dev reps to their auth users (created via the admin API by
-- scripts/seed-dev-users.mjs) and seed a small FAKE board so the dashboards
-- render. Rep ids are fixed; auth_user_id is resolved by email so this is
-- reproducible in any environment where the seed script has run.

insert into reps (id, name, role, auth_user_id, created_at)
select 'bbbbbbbb-0000-0000-0000-000000000001', 'Hassan', 'admin',
       u.id, now()
from auth.users u where u.email = 'hassan@scout.dev'
on conflict (id) do update
  set name = excluded.name, role = excluded.role, auth_user_id = excluded.auth_user_id;

insert into reps (id, name, role, auth_user_id, created_at)
select 'bbbbbbbb-0000-0000-0000-000000000002', 'Aneeb', 'rep',
       u.id, now()
from auth.users u where u.email = 'aneeb@scout.dev'
on conflict (id) do update
  set name = excluded.name, role = excluded.role, auth_user_id = excluded.auth_user_id;

insert into reps (id, name, role, auth_user_id, created_at)
select 'bbbbbbbb-0000-0000-0000-000000000003', 'Madiha', 'rep',
       u.id, now()
from auth.users u where u.email = 'madiha@scout.dev'
on conflict (id) do update
  set name = excluded.name, role = excluded.role, auth_user_id = excluded.auth_user_id;

insert into reps (id, name, role, auth_user_id, created_at)
select 'bbbbbbbb-0000-0000-0000-000000000004', 'Ahmad', 'rep',
       u.id, now()
from auth.users u where u.email = 'ahmad@scout.dev'
on conflict (id) do update
  set name = excluded.name, role = excluded.role, auth_user_id = excluded.auth_user_id;

-- FAKE demo pipeline so the app has something to render.
-- Only insert if the linked reps actually exist (the seed script may not have run yet).
insert into leads
  (id, owner_rep_id, company, contact_name, contact_title, url, raw_input,
   signal_type, signal_evidence, verbatim_quote, score, verdict, status, created_at)
select * from (values
  (
    'ffffffff-0000-0000-0000-000000000001'::uuid, 'bbbbbbbb-0000-0000-0000-000000000001'::uuid,
    'Acme Nail Polish Co', 'Priya Sharma', 'Founder', 'https://example.com/acme',
    'FAKE demo lead. Priya Sharma, founder of Acme Nail Polish Co. Posted on LinkedIn: "We are drowning in a backlog and honestly open to a partner who can take the mobile app over." Last release was 14 months ago.',
    7, 'Founder posted publicly that the team is drowning in backlog and is open to a partner taking over the mobile app; last release 14 months ago.',
    'We are honestly open to a partner who can take the mobile app over', 11, 'send', 'contacted', now() - interval '6 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000002'::uuid, 'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    'Beacon Hotel Booking', 'Leo Fontaine', 'CTO', 'https://example.com/beacon',
    'FAKE demo lead. Beacon Hotel Booking lists 4 open engineering roles and 2 product roles. CTO Leo Fontaine.',
    1, 'Four open engineering roles and two product roles listed in the last month.',
    null, 10, 'send', 'new', now() - interval '1 day'
  ),
  (
    'ffffffff-0000-0000-0000-000000000003'::uuid, 'bbbbbbbb-0000-0000-0000-000000000003'::uuid,
    'Cedar Tree Software', 'Maya Osei', 'Head of Product', 'https://example.com/cedar',
    'FAKE demo lead. App store reviews complain the latest fix took six months. Head of Product Maya Osei.',
    6, 'Multiple recent reviews mention a simple bug reportedly taking six months to ship.',
    'Six months for a one-line fix', 8, 'research_more', 'contacted', now() - interval '4 days'
  )
) as v(id, owner_rep_id, company, contact_name, contact_title, url, raw_input, signal_type, signal_evidence, verbatim_quote, score, verdict, status, created_at)
where exists (select 1 from reps r where r.id = v.owner_rep_id)
on conflict (id) do nothing;

insert into messages (id, lead_id, rep_id, type, sent_text, sent_at, model_used, created_at)
select * from (values
  ('99999999-0000-0000-0000-000000000001'::uuid, 'ffffffff-0000-0000-0000-000000000001'::uuid,
   'bbbbbbbb-0000-0000-0000-000000000001'::uuid, 'dm',
   'Hey Priya, saw your post about the backlog. We help teams like yours take a product off their shoulders. Want a quick read on your mobile app? Best.',
   now() - interval '6 days', 'demo-seed', now() - interval '6 days'),
  ('99999999-0000-0000-0000-000000000003'::uuid, 'ffffffff-0000-0000-0000-000000000003'::uuid,
   'bbbbbbbb-0000-0000-0000-000000000003'::uuid, 'dm',
   'Hi Maya, the review about the six month wait caught my eye. We ship faster than that for teams your size. Worth 15 minutes? Best regards.',
   now() - interval '4 days', 'demo-seed', now() - interval '4 days')
) as v(id, lead_id, rep_id, type, sent_text, sent_at, model_used, created_at)
where exists (select 1 from reps r where r.id = v.rep_id)
  and exists (select 1 from leads l where l.id = v.lead_id)
on conflict (id) do nothing;

insert into outcomes (id, lead_id, stage, occurred_at)
select * from (values
  ('88888888-0000-0000-0000-000000000001'::uuid, 'ffffffff-0000-0000-0000-000000000001'::uuid, 'read', now() - interval '5 days'),
  ('88888888-0000-0000-0000-000000000002'::uuid, 'ffffffff-0000-0000-0000-000000000001'::uuid, 'check', now() - interval '4 days'),
  ('88888888-0000-0000-0000-000000000003'::uuid, 'ffffffff-0000-0000-0000-000000000001'::uuid, 'replied', now() - interval '4 days'),
  ('88888888-0000-0000-0000-000000000004'::uuid, 'ffffffff-0000-0000-0000-000000000003'::uuid, 'read', now() - interval '3 days')
) as v(id, lead_id, stage, occurred_at)
where exists (select 1 from leads l where l.id = v.lead_id)
on conflict (id) do nothing;