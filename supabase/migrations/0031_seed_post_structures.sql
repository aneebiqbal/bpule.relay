-- 0031: seed the curated post-structure library — small, observed patterns,
-- used as scaffolding during generation, never as a claim about performance.

insert into content_post_structures (category, structure_name, shape, example) values
(
  'contrarian_opener',
  'The reversal',
  'State the common belief in one line. Flatly contradict it in the next. Spend the rest of the post on the real reason, grounded in the source material, not abstract theory.',
  'Everyone says ship fast and fix later. We shipped fast for two years and spent the third year fixing. Here''s what that actually cost us.'
),
(
  'contrarian_opener',
  'The quiet disagreement',
  'Open by naming what most people in the field do. State plainly that you do the opposite, then explain the one real situation that taught you why.',
  'Most PMs write a spec before talking to an engineer. I stopped doing that after a project where the spec was wrong on page one.'
),
(
  'story_opener',
  'The specific moment',
  'Open on one concrete moment in time (a meeting, a message, a bug) with a real detail, not a summary. Let the lesson emerge from what happened, not be stated first.',
  'Tuesday, 4pm. A client asked why the dashboard was still loading. It wasn''t the query. It was the query we forgot to cache six months ago.'
),
(
  'story_opener',
  'Before and after',
  'Describe the state of things before, in one or two lines. Describe what changed. Let the contrast carry the point instead of explaining it.',
  'Before: three people manually checking this every morning. After: one alert, one owner, zero manual checks. The change took an afternoon.'
),
(
  'question_opener',
  'The real question someone asked',
  'Open with an actual question a real person asked you or your team, attributed honestly (a client, a teammate, a comment) not a rhetorical one aimed at the reader.',
  'A client asked me last week why we don''t just use the cheapest option. Here''s the honest answer I gave them.'
),
(
  'data_point_opener',
  'The number that surprised you',
  'Lead with one real, specific number from your own material. Explain what it actually measures before drawing any conclusion from it.',
  '14 seconds. That''s how long our onboarding took before we cut it down. Here is what we removed.'
)
on conflict do nothing;
