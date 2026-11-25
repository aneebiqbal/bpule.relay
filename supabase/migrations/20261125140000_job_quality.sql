-- Conservative job quality classification.
--
-- Additive. Classification never deletes or hides a job by itself; the feed
-- projection decides what a classification means for visibility. Suspicious
-- listings are quarantined from the active feed but remain queryable, auditable
-- and reversible by an admin.

alter table jobs add column if not exists quality_classification text
  check (quality_classification in ('eligible', 'needs_review', 'suspected_duplicate', 'suspected_scam'));

alter table jobs add column if not exists quality_reasons jsonb not null default '[]'::jsonb;

create index if not exists jobs_quality_idx
  on jobs (quality_classification)
  where quality_classification is not null;

alter table job_inventory_index add column if not exists quality_classification text;

comment on column jobs.quality_classification is
  'Deterministic, conservative risk classification. Suspected scam quarantines from the active feed; never a deletion.';
