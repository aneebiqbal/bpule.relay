-- 022: Per-organization rulebook configuration.
--
-- Moves the scoring rubric, signal definitions, and verdict thresholds from
-- hardcoded application code into per-organization database configuration. Each
-- organization gets its own rulebook row on creation. bpulse's existing rubric
-- (7 signals, score bands) becomes the first organization's data rather than
-- the app's baked-in default.

create table organization_rulebooks (
  organization_id uuid primary key references organizations(id) on delete cascade,
  signals jsonb not null default '[]'::jsonb,
  verdict_thresholds jsonb not null default '{}'::jsonb,
  max_signal_weight int not null default 7,
  max_completeness int not null default 5,
  confidence_send_threshold int not null default 72,
  updated_at timestamptz default now()
);

-- Seed bpulse's rulebook from the hardcoded values in src/lib/score/signals.ts.
insert into organization_rulebooks (
  organization_id,
  signals,
  verdict_thresholds,
  max_signal_weight,
  max_completeness,
  confidence_send_threshold
)
values (
  '11111111-1111-1111-1111-111111111111',
  '[
    {"id":1,"name":"hiring","weight":6,"short":"Hiring ramp","description":"Recent job posts, especially engineering or operations roles, suggesting the team cannot keep up with shipping.","example":"Three open engineering roles listed in the last month."},
    {"id":2,"name":"understaffed","weight":5,"short":"Tiny team","description":"A solo founder or a very small team visibly maintaining the whole product.","example":"The app page credits a single developer for the last two releases."},
    {"id":3,"name":"funding","weight":4,"short":"Raised money","description":"A recent funding round, which usually means budget to spend on delivery.","example":"Announced a seed round of $2M in the press release."},
    {"id":4,"name":"stale","weight":4,"short":"Stale product","description":"No meaningful updates for months, an outdated store listing, or broken visible features.","example":"Last app update was more than a year ago and reviews call it out."},
    {"id":5,"name":"weak_stack","weight":3,"short":"Aging stack","description":"Dated or weak technology mentions, like old frameworks, no mobile presence, or legacy integrations.","example":"Runs an unsupported framework version with no mobile app."},
    {"id":6,"name":"pain","weight":5,"short":"Recorded pain","description":"Complaints about release speed, missed deadlines, cost, or quality that point at delivery capacity.","example":"A review or post describing a six-month wait for a simple fix."},
    {"id":7,"name":"asking","weight":7,"short":"Asking for help","description":"A founder or lead publicly asking for help, praising an agency, or otherwise signaling they are open to partners.","example":"Posted looking for a dev shop to take over the mobile app."}
  ]'::jsonb,
  '{"send":{"min":10,"max":12},"research_more":{"min":7,"max":9},"skip":{"min":0,"max":6}}'::jsonb,
  7,
  5,
  72
)
on conflict (organization_id) do nothing;
