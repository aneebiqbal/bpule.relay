-- Studio V3: Quality scoring + visual direction columns

ALTER TABLE daily_content_ideas
  ADD COLUMN IF NOT EXISTS quality_result jsonb,
  ADD COLUMN IF NOT EXISTS visual_realism text;

comment on column daily_content_ideas.quality_result is 'Post quality scoring result (overall, dimensions, failures)';
comment on column daily_content_ideas.visual_realism is 'Visual realism level (photorealistic, stylized, editorial)';
