insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c1000000-0000-0000-0000-000000000001', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'SBA 504 Lead Gen Website', 'Shohel Ahmed', 'Build SBA 504 loan website with Astro, 11 templates.', '5.0 stars. Built and deployed with exceptional support.', 'Full stack build', '2026-04-13', '2026-08-19', false, 'fixed', 2450.0, 5.0, array['astro','sanity','vercel'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c1000000-0000-0000-0000-000000000002', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'React Firebase AI E-Commerce', 'Muhammad Behsas', 'Backend for WearMeOut.ai. Firebase, AI image gen, payments.', '5.0 stars. Full ownership, reliable.', 'Backend Firebase', '2026-05-05', '2026-07-25', false, 'fixed', 3100.0, 5.0, array['react','firebase'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c1000000-0000-0000-0000-000000000003', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Digital Asset Management', 'Antonio Bonet', 'Branded DAM portal, bilingual, role-based.', '5.0 stars. Knowledgeable.', 'Full stack', '2025-12-20', '2026-05-11', false, 'fixed', 400.0, 5.0, array['dam','cms'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c1000000-0000-0000-0000-000000000004', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Chrome Extension WXT Svelte', 'Rory G', 'LinkedIn sourcer extension.', '5.0 stars. Took initiative.', 'Extension dev', '2025-12-22', '2026-03-16', false, 'hourly', 3979.17, 5.0, array['browser-extension','svelte'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c1000000-0000-0000-0000-000000000005', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Visual Search Engine CSS', 'Ofer Langer', 'Finish appranker.io.', '5.0 stars. Brilliant.', 'Full stack', '2025-12-14', '2025-12-31', false, 'fixed', 150.0, 5.0, array['css','figma'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c1000000-0000-0000-0000-000000000006', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Deploy Python Trading Bot', 'Sajjad Masumi', 'Deploy Python bot to Railway.', '5.0 stars. Fixed bugs.', 'DevOps', '2025-07-01', '2025-12-08', false, 'hourly', 640.0, 5.0, array['python','flask'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c1000000-0000-0000-0000-000000000007', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Visual Search Second Engage', 'Ofer Langer', 'No Code to launch.', '5.0 stars. Creative.', 'Full stack', '2025-11-03', '2025-11-18', false, 'fixed', 120.0, 5.0, array['full-stack'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c1000000-0000-0000-0000-000000000008', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Yotpo Reviews Rails CMS', 'Dmytro', 'Yotpo into Rails.', '5.0 stars. Skilled.', 'Backend', '2025-07-23', '2025-08-01', false, 'fixed', 10.0, 5.0, array['rails','yotpo'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c1000000-0000-0000-0000-000000000009', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Full Stack Dev Screening', 'Jorick Alberga', 'Screen candidates.', '5.0 stars. Expert.', 'Screener', '2025-11-25', '2026-03-04', false, 'hourly', 140.0, 5.0, array['screening'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c1000000-0000-0000-0000-000000000010', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Community Transport Platform', 'Jose L Peralta', 'Transport booking.', 'None yet.', 'Senior Full Stack', '2026-07-06', null, true, 'fixed', 370.0, null, array['nextjs','firebase'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c1000000-0000-0000-0000-000000000011', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Mythos Architecture Disc', 'Robby', 'Private.', '5.0 stars. Outstanding.', 'Architecture', '2026-05-07', null, true, 'fixed', 12750.0, 5.0, array['architecture'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c1000000-0000-0000-0000-000000000012', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Property Management SaaS', 'Evens Michel', 'Resido property mgmt.', '5.0 stars. Excellent.', 'Senior React', '2025-11-26', null, true, 'fixed', 400.0, 5.0, array['react','saas'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c1000000-0000-0000-0000-000000000013', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'GIS Asset Mgmt App', 'Olly Walls', 'GIS Asset Mgmt.', '5.0 stars. Immediate.', 'Not specified', '2025-07-05', null, true, 'fixed', 4232.0, 5.0, array['gis'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c2000000-0000-0000-0000-000000000001', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000011'), 'Move GCP to Firebase', 'Ron', 'Migrate GCP to Firebase.', 'In progress.', 'Not specified', '2026-09-04', null, true, 'fixed', 50.0, null, array['gcp','firebase'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c2000000-0000-0000-0000-000000000002', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000011'), 'Complete MVP SaaS', 'Pontus', 'AI compliance from Lovable.', '5.0 stars. Production ready.', 'Full stack', '2026-03-19', null, true, 'fixed', 1660.0, 5.0, array['compliance','gdpr'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c2000000-0000-0000-0000-000000000003', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000011'), 'AI Chat Blockchain', 'Joseph Kim', 'Chat with AI/blockchain.', 'In progress.', 'Not specified', '2026-01-03', null, true, 'fixed', 900.0, null, array['ai','blockchain'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c3000000-0000-0000-0000-000000000001', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'OIDC Auth Next.js', 'Clement Simon', 'OIDC for Next.js.', 'No feedback.', 'Full Stack Dev', '2025-11-25', '2026-02-09', false, null, null, null, array['oidc','nextjs'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c3000000-0000-0000-0000-000000000002', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'PDR Anyplace Viewer', 'Tariq Mehmood', 'PDR for indoor.', 'Skill and instinct.', 'Mobile Dev', '2025-10-27', '2025-10-29', false, null, null, null, array['pdr','mobile'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c3000000-0000-0000-0000-000000000003', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'Social Media Langflow', 'Jon Elbaz', 'Agentic social media.', 'Exceptional.', 'AI Automation', '2025-05-01', '2025-09-05', false, null, null, null, array['langflow'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c3000000-0000-0000-0000-000000000004', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'Update AI Trip Planner', 'Andre Beaumont', 'Fix blank screen.', 'Fast fix.', 'Full Stack Dev', '2026-01-08', '2026-01-11', false, null, null, null, array['react','vite'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c3000000-0000-0000-0000-000000000005', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'Node.js Agentic Marketing', 'Kevin Marsh', 'Content engine.', 'Standout.', 'Node.js Dev', '2026-02-19', '2026-02-20', false, null, null, null, array['langflow','nodejs'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c4000000-0000-0000-0000-000000000001', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'SEO Landing Financial', 'William Stacey', 'SEO lead gen.', 'Really happy.', 'Full Stack Dev', '2025-07-07', '2025-08-22', false, null, null, null, array['seo'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c4000000-0000-0000-0000-000000000002', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'Architecture Knowledge', 'Elliot Drummond', 'Arch sprint.', 'Useful.', 'Tech Architect', '2025-09-03', '2025-10-17', false, null, null, null, array['architecture'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c4000000-0000-0000-0000-000000000003', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'React Firebase E-Commerce', 'Nasser Al Fahad', 'Firebase backend.', 'Only dev we use.', 'Backend Dev', '2025-11-10', '2026-01-23', false, null, null, null, array['firebase','ecommerce'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c4000000-0000-0000-0000-000000000004', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'Browser Ext Svelte Rails', 'Liam Fogarty', 'WXT extension.', 'Fast pickup.', 'Full Stack Dev', '2026-02-05', '2026-03-14', false, null, null, null, array['browser-extension','svelte'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c4000000-0000-0000-0000-000000000005', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'OIDC Auth Overhaul', 'Stefan Richter', 'OIDC for Next.js.', 'Fast work.', 'Full Stack Dev', '2025-04-14', '2025-06-20', false, null, null, null, array['oidc','nextjs'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c4000000-0000-0000-0000-000000000006', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'Agentic Content Langflow', 'Craig Donaghue', 'Content gen.', 'Gets both sides.', 'AI Dev', '2026-03-03', '2026-04-11', false, null, null, null, array['langflow','ai'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c4000000-0000-0000-0000-000000000007', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'Indoor PDR Mobile', 'Bilal Chaudhry', 'PDR for mobile.', 'First try.', 'Mobile Dev', '2026-05-19', '2026-05-22', false, null, null, null, array['pdr','mobile'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c5000000-0000-0000-0000-000000000001', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000014'), 'Compliance Platform EU', 'James Whitmore', 'GDPR/NIS2/DORA/CSRD.', 'Ship it.', 'Full Stack Dev', '2026-03-05', '2026-04-12', false, null, null, null, array['compliance','rls'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c5000000-0000-0000-0000-000000000002', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000014'), 'Chat Blockchain Settlement', 'Ryan Carter', 'Chat + blockchain.', 'Complex build.', 'Full Stack Dev', '2026-01-08', '2026-03-02', false, null, null, null, array['blockchain','chat'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c5000000-0000-0000-0000-000000000003', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000014'), 'Brand Asset Portal', 'Marcus Webb', 'Brand portal.', 'No hand holding.', 'Full Stack Dev', '2025-10-14', '2025-12-09', false, null, null, null, array['dam','cms'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c5000000-0000-0000-0000-000000000004', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000014'), 'Browser Ext LinkedIn', 'Daniel Kowalski', 'LinkedIn ext.', 'Improved unasked.', 'Full Stack Dev', '2025-08-06', '2025-09-24', false, null, null, null, array['browser-extension','svelte'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c5000000-0000-0000-0000-000000000005', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000014'), 'CSS Animation Search Engine', 'Chris Harmon', 'CSS appranker.io.', 'On time.', 'Full Stack Dev', '2025-06-11', '2025-07-30', false, null, null, null, array['css','figma'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c5000000-0000-0000-0000-000000000006', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000014'), 'Python Trading Bot Kalshi', 'Samuel Osei', 'Deploy bot.', 'Found bugs.', 'DevOps', '2025-04-17', '2025-05-03', false, null, null, null, array['python','trading-bot'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c5000000-0000-0000-0000-000000000007', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000014'), 'No-Code Production', 'Nathan Brooks', 'Launch prep.', 'Zero ramp.', 'Full Stack Dev', '2025-02-17', '2025-04-04', false, null, null, null, array['css','react'])
on conflict (id) do nothing;

insert into client_contracts (id, organization_id, profile_id, project_title, client_name, job_description, client_feedback, my_role, project_start_date, project_end_date, is_ongoing, budget_type, budget_earned, client_rating, tags) values
('c5000000-0000-0000-0000-000000000008', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000014'), 'Yotpo Reviews Rails', 'David Okafor', 'Yotpo Rails.', 'First try.', 'Backend Dev', '2024-12-09', '2025-01-14', false, null, null, null, array['rails','yotpo'])
on conflict (id) do nothing;
