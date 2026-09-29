-- AI Runtime V3 — Intelligence Layer V1: extend ai_traces with observability columns

alter table ai_traces
  add column if not exists call_site text not null default 'unknown',
  add column if not exists feature text not null default 'unknown',
  add column if not exists model_tier text,
  add column if not exists prompt_version text,
  add column if not exists cache_hit boolean not null default false;

create index if not exists ai_traces_org_feature_idx on ai_traces (organization_id, feature);
create index if not exists ai_traces_org_tier_idx on ai_traces (organization_id, model_tier);

comment on column ai_traces.call_site is 'Code location that initiated the call';
comment on column ai_traces.feature is 'Product feature that initiated the call';
comment on column ai_traces.model_tier is 'Intelligence tier used: luna | terra | sol';
comment on column ai_traces.prompt_version is 'Prompt version identifier for regression tracking';
comment on column ai_traces.cache_hit is 'Whether result was served from deterministic cache';
