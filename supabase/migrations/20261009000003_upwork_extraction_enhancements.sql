-- Upwork extraction enhancements: add structured fields for screening questions,
-- application requirements, engagement details, and experience level.

alter table upwork_jobs add column if not exists screening_questions text[] default '{}';
alter table upwork_jobs add column if not exists application_requirements text[] default '{}';
alter table upwork_jobs add column if not exists engagement_type text;
alter table upwork_jobs add column if not exists weekly_hours text;
alter table upwork_jobs add column if not exists duration text;
alter table upwork_jobs add column if not exists experience_level text;
