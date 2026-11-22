-- Structured job requirements intelligence (deterministic, evidence-backed).
alter table jobs add column if not exists requirements jsonb;
create index if not exists jobs_requirements_gin on jobs using gin (requirements jsonb_path_ops);
