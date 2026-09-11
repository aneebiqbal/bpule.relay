-- Play wiring + full FAKE seed board.
--
-- 1) Add play_id to leads. The app has been INSERTing play_id since the play
--    pass, so this unblocks lead creation on hosted (the 500 on POST /api/leads).
-- 2) Backfill play_id on existing rows using the same matching rule as the app
--    (src/lib/score/plays.ts): hiring -> hiring play, funding -> funding play,
--    everything else -> the first/asking play.
-- 3) Seed a full fictional board across all 7 signals so every screen has
--    believable data. Scores below are computed by hand with the published
--    rubric (signal weight + completeness, max 12) so breakdowns stay exact.

alter table leads add column play_id uuid references plays(id);
create index leads_play_idx on leads (play_id);

update leads set play_id = case signal_type
  when 1 then 'eeeeeeee-0000-0000-0000-000000000002'::uuid
  when 3 then 'eeeeeeee-0000-0000-0000-000000000003'::uuid
  else        'eeeeeeee-0000-0000-0000-000000000001'::uuid
end
where play_id is null;

-- Existing board cleanup: Acme already has a 'replied' outcome, so its status
-- should read replied (it moves out of the queue and into Replies waiting).
update leads set status = 'replied'
where id = 'ffffffff-0000-0000-0000-000000000001' and status = 'contacted';

-- ---------------------------------------------------------------------------
-- FAKE seed board, part 2. All companies/contacts are fictional. Scores are
-- rubric-exact: weight + [url + name + title + specific evidence + quote].
-- Only inserted if the dev reps from 0004 exist (the seed script may not have
-- run yet, e.g. in CI or fresh local environments).
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from reps where id in (
    'bbbbbbbb-0000-0000-0000-000000000001',
    'bbbbbbbb-0000-0000-0000-000000000002',
    'bbbbbbbb-0000-0000-0000-000000000003',
    'bbbbbbbb-0000-0000-0000-000000000004'
  )) < 4 then
    raise notice 'Skipping 0005 seed: dev reps not found. Run scripts/seed-dev-users.mjs first.';
    return;
  end if;

  insert into leads
  (id, owner_rep_id, company, contact_name, contact_title, url, raw_input,
   signal_type, signal_evidence, verbatim_quote, score, verdict, status, play_id, created_at)
values
  -- offering signal (7, weight 7)
  (
    'ffffffff-0000-0000-0000-000000000020', 'bbbbbbbb-0000-0000-0000-000000000001',
    'Violet & Vine', 'Nadia Okafor', 'Founder', 'https://example.com/violet',
    'FAKE seed lead. Founder posted publicly that the team wants a partner to run the app; last release 8 months ago.',
    7, 'Founder posted openly: wants a partner to take the app over within the next 2 quarters.',
    'We just need someone to run the app for us', 12, 'send', 'replied',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '8 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000021', 'bbbbbbbb-0000-0000-0000-000000000004',
    'Copper Finch', 'Dana Ilyasova', 'Product Lead', 'https://example.com/copper',
    'FAKE seed lead. Posted asking for a developer shop to take over the Android app.',
    7, 'Posted asking for a dev shop to take over a 3 year old Android app.',
    null, 11, 'send', 'new',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '1 day'
  ),
  (
    'ffffffff-0000-0000-0000-000000000022', 'bbbbbbbb-0000-0000-0000-000000000001',
    'Juniper & Sage', 'Tom Bancroft', null, 'https://example.com/juniper',
    'FAKE seed lead. LinkedIn post asking for React Native recommendations.',
    7, 'Posted asking who handles React Native for a 2 person team.',
    null, 10, 'send', 'new',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '3 days'
  ),
  -- hiring ramp (1, weight 6)
  (
    'ffffffff-0000-0000-0000-000000000023', 'bbbbbbbb-0000-0000-0000-000000000002',
    'Grandway Logistics', 'Erin Whitfield', 'VP Engineering', 'https://example.com/grandway',
    'FAKE seed lead. 21 open roles listed; hiring across engineering and product.',
    1, 'Twenty one open roles across engineering and product in the last month.',
    'We cannot hire fast enough to ship', 11, 'send', 'contacted',
    'eeeeeeee-0000-0000-0000-000000000002', now() - interval '6 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000024', 'bbbbbbbb-0000-0000-0000-000000000001',
    'Mosaic Financials', null, null, 'https://example.com/mosaic',
    'FAKE seed lead. Board lists 9 roles; no named contact captured.',
    1, 'Nine open engineering roles listed in the last month.',
    'Please somebody help us ship', 9, 'research_more', 'new',
    'eeeeeeee-0000-0000-0000-000000000002', now() - interval '2 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000025', 'bbbbbbbb-0000-0000-0000-000000000003',
    'Parkline Studios', 'Omar Sati', null, null,
    'FAKE seed lead. Found a jobs page with 6 roles but no source URL captured.',
    1, 'Six engineering roles posted in the last month on the careers page.',
    null, 8, 'research_more', 'contacted',
    'eeeeeeee-0000-0000-0000-000000000002', now() - interval '5 days'
  ),
  -- understaffed (2, weight 5)
  (
    'ffffffff-0000-0000-0000-000000000026', 'bbbbbbbb-0000-0000-0000-000000000002',
    'Kestrel Systems', 'Hana Yoshida', 'CTO', 'https://example.com/kestrel',
    'FAKE seed lead. Product built by two founders serving thousands of users.',
    2, 'Two people ship the product for 5,000 users.',
    'We are two people shipping for five thousand users', 10, 'send', 'replied',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '12 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000027', 'bbbbbbbb-0000-0000-0000-000000000003',
    'Highland Botanics', null, null, 'https://example.com/highland',
    'FAKE seed lead. Solo founder visible in all support threads.',
    2, 'One person answers every support thread and signs the release notes.',
    null, 7, 'research_more', 'new',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '2 hours'
  ),
  (
    'ffffffff-0000-0000-0000-000000000028', 'bbbbbbbb-0000-0000-0000-000000000001',
    'Quill & Canvas', null, null, 'https://example.com/quill',
    'FAKE seed lead. Solo owner on every thread; team declined outreach last year.',
    2, 'A solo owner shows up in support threads for every release.',
    null, 6, 'skip', 'no',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '20 days'
  ),
  -- funding (3, weight 4)
  (
    'ffffffff-0000-0000-0000-000000000029', 'bbbbbbbb-0000-0000-0000-000000000002',
    'Basalt Rover', 'Janek Krol', 'CEO', 'https://example.com/basalt',
    'FAKE seed lead. Closed a seed round of $1.8M and expanding to two markets.',
    3, 'Closed a $1.8M seed round and announced two new markets.',
    null, 8, 'research_more', 'contacted',
    'eeeeeeee-0000-0000-0000-000000000003', now() - interval '7 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000030', 'bbbbbbbb-0000-0000-0000-000000000001',
    'Cinder Studio', 'Ravi Chandran', 'Head of Engineering', 'https://example.com/cinder',
    'FAKE seed lead. Raised $4M and named delivery speed as the bottleneck.',
    3, 'Raised a $4M round; the announcement names delivery speed as the focus.',
    null, 8, 'research_more', 'new',
    'eeeeeeee-0000-0000-0000-000000000003', now() - interval '4 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000031', 'bbbbbbbb-0000-0000-0000-000000000003',
    'Fennel & Co', 'Paolo Ricci', null, null,
    'FAKE seed lead. Small pre-seed, no URL captured, team not obviously ready.',
    3, 'Announced a pre-seed of $600k in a local newsletter.',
    null, 6, 'skip', 'dead',
    'eeeeeeee-0000-0000-0000-000000000003', now() - interval '15 days'
  ),
  -- stale product (4, weight 4)
  (
    'ffffffff-0000-0000-0000-000000000032', 'bbbbbbbb-0000-0000-0000-000000000001',
    'Old Harbor Supplies', 'Ingrid Halvorsen', 'Owner', 'https://example.com/oldharbor',
    'FAKE seed lead. Storefront untouched for 3 years; orders still coming in.',
    4, 'Store listing untouched for 3 years while customer reviews pile up.',
    null, 8, 'research_more', 'contacted',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '9 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000033', 'bbbbbbbb-0000-0000-0000-000000000002',
    'Rook & Thorn', null, null, 'https://example.com/rook',
    'FAKE seed lead. App last updated 14 months ago; several broken flows.',
    4, 'Last app update 14 months ago and reviews call out broken checkout.',
    null, 6, 'skip', 'new',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '6 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000034', 'bbbbbbbb-0000-0000-0000-000000000004',
    'Stoney Creek Market', 'Sue Park', 'Co-owner', 'https://example.com/stoney',
    'FAKE seed lead. Product dormant since a rebrand 2 years ago.',
    4, 'No updates since a rebrand 2 years ago; contact page lists both owners.',
    null, 8, 'research_more', 'new',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '5 days'
  ),
  -- weak stack (5, weight 3)
  (
    'ffffffff-0000-0000-0000-000000000035', 'bbbbbbbb-0000-0000-0000-000000000002',
    'Prairie Post & Inbox', 'Will Alder', null, 'https://example.com/prairie',
    'FAKE seed lead. Runs an unsupported framework and a locally installed store.',
    5, 'Runs an unsupported framework version with no deployed CI.',
    null, 6, 'skip', 'contacted',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '8 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000036', 'bbbbbbbb-0000-0000-0000-000000000001',
    'Tungsten Desk', 'Miri Ben-Ari', null, 'https://example.com/tungsten',
    'FAKE seed lead. Stack is dated; team said no last quarter.',
    5, 'Dated framework with no mobile presence in 2026.',
    null, 6, 'skip', 'no',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '18 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000037', 'bbbbbbbb-0000-0000-0000-000000000003',
    'Larch & Loom', 'Vera Kolbe', null, null,
    'FAKE seed lead. Static site abandoned and support is a shared inbox.',
    5, 'Site last rebuilt 2 years ago with an abandoned shopping cart.',
    null, 5, 'skip', 'dead',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '16 days'
  ),
  -- recorded pain (6, weight 5)
  (
    'ffffffff-0000-0000-0000-000000000038', 'bbbbbbbb-0000-0000-0000-000000000001',
    'Greystone Insurance', 'Anya Petrova', 'Cofounder', 'https://example.com/greystone',
    'FAKE seed lead. Reviews describe a one line fix taking a full quarter.',
    6, 'Reviews describe a one line fix taking an entire quarter to ship.',
    'A one line fix took our whole quarter', 10, 'send', 'replied',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '10 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000039', 'bbbbbbbb-0000-0000-0000-000000000002',
    'Birchwood Clinic', 'Maja Lind', 'Director of Ops', 'https://example.com/birchwood',
    'FAKE seed lead. Patient portal bugs reportedly wait 2 months for fixes.',
    6, 'Patient portal fixes wait about 2 months and the team admits it.',
    null, 9, 'research_more', 'followed_up',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '11 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000040', 'bbbbbbbb-0000-0000-0000-000000000003',
    'Alder Vale Properties', null, null, null,
    'FAKE seed lead. Complaints thread on a maintenance portal. No owner captured.',
    6, 'Tenant portal thread describes a 4 month wait for a rent fix.',
    'Four months to change rent settings', 7, 'research_more', 'new',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '3 days'
  ),
  -- today's fresh send-ready leads
  (
    'ffffffff-0000-0000-0000-000000000041', 'bbbbbbbb-0000-0000-0000-000000000001',
    'Northstar Machinery', 'Luc Renard', 'Head of Digital', 'https://example.com/northstar',
    'FAKE seed lead. Posting 5 developer roles while the site runs on the free tier.',
    1, 'Five developer roles posted this month; careers page says hiring behind schedule.',
    'The roadmap keeps slipping a quarter', 11, 'send', 'new',
    'eeeeeeee-0000-0000-0000-000000000002', now() - interval '1 day'
  ),
  (
    'ffffffff-0000-0000-0000-000000000042', 'bbbbbbbb-0000-0000-0000-000000000002',
    'Saffron & Steel', 'Tessa Osei', 'Founder', 'https://example.com/saffron',
    'FAKE seed lead. Founder asked publicly for a shop that fixes a broken app fast.',
    7, 'Founder posted asking for a team that can rescue a broken app in 1 month.',
    'We have a launch in 1 month and nothing works', 12, 'send', 'new',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '4 hours'
  ),
  (
    'ffffffff-0000-0000-0000-000000000043', 'bbbbbbbb-0000-0000-0000-000000000004',
    'Olive Branch CRM', 'Ben Haddad', null, 'https://example.com/olivebranch',
    'FAKE seed lead. Market push depends on 8 API integrations the team cannot staff.',
    1, 'Eight API integrations needed for launch and the team cannot staff them.',
    'We are stuck on the integrations', 10, 'send', 'new',
    'eeeeeeee-0000-0000-0000-000000000002', now() - interval '2 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000044', 'bbbbbbbb-0000-0000-0000-000000000001',
    'Vervain & Co', 'Sofia Marchetti', 'Founder', 'https://example.com/vervain',
    'FAKE seed lead. Two person shop scaling to a second market.',
    2, 'Two people run engineering for a product launching in a second market.',
    'We built this whole app with two people', 10, 'send', 'contacted',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '7 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000045', 'bbbbbbbb-0000-0000-0000-000000000003',
    'Coral Reef Logistics', 'Idris Balde', 'Head of Product', 'https://example.com/coral',
    'FAKE seed lead. Support queue backlogged 6 weeks; team posts updates monthly.',
    6, 'Support queue is 6 weeks deep and the team admits release cadence slipped.',
    'Our release train derailed months ago', 10, 'send', 'followed_up',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '9 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000046', 'bbbbbbbb-0000-0000-0000-000000000002',
    'Harborline', 'Nils Andresen', null, 'https://example.com/harborline',
    'FAKE seed lead. Fresh pre-seed, small team, no quote captured.',
    3, 'Pre-seed of $950k announced; team of 4 shipping a logistics slate.',
    null, 7, 'research_more', 'new',
    'eeeeeeee-0000-0000-0000-000000000003', now() - interval '5 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000047', 'bbbbbbbb-0000-0000-0000-000000000001',
    'Marble Arch Labs', null, null, 'https://example.com/marble',
    'FAKE seed lead. Product dormant for 2 years with a loyal small base. No contact on file.',
    4, 'App dormant for 2 years; forum asks when it will come back.',
    null, 6, 'skip', 'new',
    'eeeeeeee-0000-0000-0000-000000000001', now() - interval '7 days'
  )
on conflict (id) do nothing;

-- Sent message history for the non-drafted/non-dead leads above. Plain text,
-- written in each rep's voice, no em dashes.
insert into messages (id, lead_id, rep_id, type, sent_text, sent_at, model_used, created_at)
values
  ('99999999-0000-0000-0000-000000000010', 'ffffffff-0000-0000-0000-000000000020', 'bbbbbbbb-0000-0000-0000-000000000001', 'dm',
   'Hey Nadia, saw your post about handing the app over. That is a good problem to solve early. Want a short read on whether I can run it for you?',
   now() - interval '7 days', 'demo-seed', now() - interval '7 days'),
  ('99999999-0000-0000-0000-000000000011', 'ffffffff-0000-0000-0000-000000000023', 'bbbbbbbb-0000-0000-0000-000000000002', 'dm',
   'Hi Erin, the hiring list caught my eye. Your team is signing up for a delivery problem, not just a people problem. Worth one call?',
   now() - interval '5 days', 'demo-seed', now() - interval '5 days'),
  ('99999999-0000-0000-0000-000000000012', 'ffffffff-0000-0000-0000-000000000025', 'bbbbbbbb-0000-0000-0000-000000000003', 'dm',
   'Hey Omar, the six roles are a lot for one shop. I take product off benches like yours. Fifteen minutes this week?',
   now() - interval '4 days', 'demo-seed', now() - interval '4 days'),
  ('99999999-0000-0000-0000-000000000013', 'ffffffff-0000-0000-0000-000000000026', 'bbbbbbbb-0000-0000-0000-000000000002', 'dm',
   'Hey Hana, two people shipping for five thousand users is impressive, and it is also the ceiling. Want a run at what breaks first?',
   now() - interval '11 days', 'demo-seed', now() - interval '11 days'),
  ('99999999-0000-0000-0000-000000000014', 'ffffffff-0000-0000-0000-000000000029', 'bbbbbbbb-0000-0000-0000-000000000002', 'dm',
   'Hi Janek, congrats on the round. Two markets from a solo bench is a stretch. I keep delivery on rails while you open the second one.',
   now() - interval '6 days', 'demo-seed', now() - interval '6 days'),
  ('99999999-0000-0000-0000-000000000015', 'ffffffff-0000-0000-0000-000000000032', 'bbbbbbbb-0000-0000-0000-000000000001', 'dm',
   'Hi Ingrid, three years without a store update and the orders still come in. Imagine what the listing does with the rust off. Quick call?',
   now() - interval '8 days', 'demo-seed', now() - interval '8 days'),
  ('99999999-0000-0000-0000-000000000016', 'ffffffff-0000-0000-0000-000000000035', 'bbbbbbbb-0000-0000-0000-000000000002', 'dm',
   'Hey Will, an unsupported framework plus no CI is a liability you are paying for nightly. I move that kind of build forward in weeks.',
   now() - interval '7 days', 'demo-seed', now() - interval '7 days'),
  ('99999999-0000-0000-0000-000000000017', 'ffffffff-0000-0000-0000-000000000038', 'bbbbbbbb-0000-0000-0000-000000000001', 'dm',
   'Hey Anya, a one line fix taking a quarter would burn down any team. I ship fixes like that in days. Worth a look at your queue?',
   now() - interval '9 days', 'demo-seed', now() - interval '9 days'),
  ('99999999-0000-0000-0000-000000000018', 'ffffffff-0000-0000-0000-000000000039', 'bbbbbbbb-0000-0000-0000-000000000002', 'dm',
   'Hi Maja, two months for portal fixes is a compliance risk, not just a nuisance. I clear queues like that without a truckload of process.',
   now() - interval '10 days', 'demo-seed', now() - interval '10 days'),
  ('99999999-0000-0000-0000-000000000019', 'ffffffff-0000-0000-0000-000000000039', 'bbbbbbbb-0000-0000-0000-000000000002', 'followup',
   'Hey Maja, last one from me. If the portal queue is about to go through procurement anyway, I can send a short plan and you judge it on the bus. Otherwise, no worries.',
   now() - interval '3 days', 'demo-seed', now() - interval '3 days'),
  ('99999999-0000-0000-0000-000000000020', 'ffffffff-0000-0000-0000-000000000044', 'bbbbbbbb-0000-0000-0000-000000000001', 'dm',
   'Hey Sofia, two people built this. That means two people also run it. I cover the running so you can go build the second market.',
   now() - interval '6 days', 'demo-seed', now() - interval '6 days'),
  ('99999999-0000-0000-0000-000000000021', 'ffffffff-0000-0000-0000-000000000045', 'bbbbbbbb-0000-0000-0000-000000000003', 'dm',
   'Hi Idris, a queue six weeks deep is the real product. I have pulled teams out of that exact hole without a rewrite.',
   now() - interval '8 days', 'demo-seed', now() - interval '8 days'),
  ('99999999-0000-0000-0000-000000000022', 'ffffffff-0000-0000-0000-000000000045', 'bbbbbbbb-0000-0000-0000-000000000003', 'followup',
   'Hey Idris, just circling once. I can put a two page plan for the support queue on your desk by Thursday if the timing is right now.',
   now() - interval '2 days', 'demo-seed', now() - interval '2 days')
on conflict (id) do nothing;

-- Outcomes: read/check/replied lines so the reply rates are computed from real
-- rows (reply rate = replied / sent; read-to-check = check / read).
insert into outcomes (id, lead_id, stage, occurred_at)
values
  ('88888888-0000-0000-0000-000000000020', 'ffffffff-0000-0000-0000-000000000020', 'read',    now() - interval '5 days'),
  ('88888888-0000-0000-0000-000000000021', 'ffffffff-0000-0000-0000-000000000020', 'check',   now() - interval '4 days'),
  ('88888888-0000-0000-0000-000000000022', 'ffffffff-0000-0000-0000-000000000020', 'replied', now() - interval '4 days'),
  ('88888888-0000-0000-0000-000000000023', 'ffffffff-0000-0000-0000-000000000023', 'read',    now() - interval '4 days'),
  ('88888888-0000-0000-0000-000000000024', 'ffffffff-0000-0000-0000-000000000025', 'read',    now() - interval '3 days'),
  ('88888888-0000-0000-0000-000000000025', 'ffffffff-0000-0000-0000-000000000026', 'read',    now() - interval '10 days'),
  ('88888888-0000-0000-0000-000000000026', 'ffffffff-0000-0000-0000-000000000026', 'check',   now() - interval '9 days'),
  ('88888888-0000-0000-0000-000000000027', 'ffffffff-0000-0000-0000-000000000026', 'replied', now() - interval '9 days'),
  ('88888888-0000-0000-0000-000000000028', 'ffffffff-0000-0000-0000-000000000029', 'read',    now() - interval '5 days'),
  ('88888888-0000-0000-0000-000000000029', 'ffffffff-0000-0000-0000-000000000032', 'read',    now() - interval '7 days'),
  ('88888888-0000-0000-0000-000000000030', 'ffffffff-0000-0000-0000-000000000032', 'check',   now() - interval '6 days'),
  ('88888888-0000-0000-0000-000000000031', 'ffffffff-0000-0000-0000-000000000035', 'read',    now() - interval '6 days'),
  ('88888888-0000-0000-0000-000000000032', 'ffffffff-0000-0000-0000-000000000038', 'read',    now() - interval '8 days'),
  ('88888888-0000-0000-0000-000000000033', 'ffffffff-0000-0000-0000-000000000038', 'replied', now() - interval '7 days'),
  ('88888888-0000-0000-0000-000000000034', 'ffffffff-0000-0000-0000-000000000039', 'read',    now() - interval '9 days'),
  ('88888888-0000-0000-0000-000000000035', 'ffffffff-0000-0000-0000-000000000044', 'read',    now() - interval '5 days'),
  ('88888888-0000-0000-0000-000000000036', 'ffffffff-0000-0000-0000-000000000045', 'read',    now() - interval '7 days')
on conflict (id) do nothing;
insert into voice_profiles (id, rep_id, style_card, sample_source, calibrated_at)
values
  (
    'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
    jsonb_build_object(
      'contractions', 'mostly_yes',
      'formality', 2,
      'sentence_length', 'short',
      'punctuation', 'standard',
      'openers', 'question',
      'emoji_use', 'none',
      'greeting', 'Hey',
      'sign_off', 'Best',
      'never_words', jsonb_build_array('leverage', 'synergy', 'seamless'),
      'preferred_words', jsonb_build_array('run it', 'bench', 'clear the queue'),
      'summary', 'You write casually. Short first sentences. No emoji. Ever.'
    ),
    'quiz', now() - interval '6 days'
  ),
  (
    'cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
    jsonb_build_object(
      'contractions', 'mostly_no',
      'formality', 3,
      'sentence_length', 'medium',
      'punctuation', 'standard',
      'openers', 'statement',
      'emoji_use', 'none',
      'greeting', 'Hi',
      'sign_off', 'Best regards',
      'never_words', jsonb_build_array('u', 'gonna', 'bro'),
      'preferred_words', jsonb_build_array('on rails', 'delivery', 'bandwidth'),
      'summary', 'You write plainly. No contractions, no emoji, sentences long enough to breathe.'
    ),
    'quiz', now() - interval '6 days'
  ),
  (
    'cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000003',
    jsonb_build_object(
      'contractions', 'sometimes',
      'formality', 2,
      'sentence_length', 'short',
      'punctuation', 'relaxed',
      'openers', 'statement',
      'emoji_use', 'light',
      'greeting', 'Hey',
      'sign_off', 'Cheers',
      'never_words', jsonb_build_array('just', 'actually', 'literally'),
      'preferred_words', jsonb_build_array('pull out', 'hole', 'plan'),
      'summary', 'You write warm and short. One emoji max, relaxed punctuation, gets to the point.'
    ),
    'quiz', now() - interval '6 days'
  )
on conflict (rep_id) do nothing;

end $$;