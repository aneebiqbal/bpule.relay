-- Studio V3: Enhanced Visual Director
-- Adds richer creative direction fields to daily_content_ideas

alter table daily_content_ideas
  add column if not exists visual_communication_goal text,
  add column if not exists visual_subject text,
  add column if not exists visual_scene text,
  add column if not exists visual_lighting text,
  add column if not exists visual_palette text,
  add column if not exists visual_mood text,
  add column if not exists visual_style text,
  add column if not exists visual_avoid text;

comment on column daily_content_ideas.visual_communication_goal is 'What the viewer understands in 3 seconds';
comment on column daily_content_ideas.visual_subject is 'The literal thing shown in the visual';
comment on column daily_content_ideas.visual_scene is 'Environment/setting description';
comment on column daily_content_ideas.visual_lighting is 'Type and quality of light';
comment on column daily_content_ideas.visual_palette is 'Specific color palette';
comment on column daily_content_ideas.visual_mood is 'Feeling/tone of the visual';
comment on column daily_content_ideas.visual_style is 'Medium style: editorial, isometric, flat vector, etc';
comment on column daily_content_ideas.visual_avoid is 'Comma-separated list of visual clichés to avoid';
