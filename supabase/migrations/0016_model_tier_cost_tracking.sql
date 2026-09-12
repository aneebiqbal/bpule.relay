-- 0016: Model architecture v2 — tier/host/cost tracking on model calls.
--
-- extraction_runs already logs success/latency/model per extraction call
-- (0015). This adds which tier and host actually served the call (tier1
-- DeepSeek Flash, tier2 DeepSeek Pro escalation, tier3 Groq fallback, tier4
-- OpenAI final fallback) and an estimated cost in USD, so cost-per-day can be
-- reported split by tier once real traffic accumulates. Drafting calls log
-- into the same table under task='draft' rather than a second table, since
-- the metrics query (cost by tier, over a rolling window) is identical.

alter table extraction_runs
  add column if not exists task text not null default 'extract' check (task in ('extract', 'draft')),
  add column if not exists cost_tier text check (cost_tier in ('tier1', 'tier2', 'tier3', 'tier4')),
  add column if not exists host text,
  add column if not exists cost_usd numeric(10, 6);

create index if not exists extraction_runs_task_idx on extraction_runs (task, created_at desc);
create index if not exists extraction_runs_cost_tier_idx on extraction_runs (cost_tier, created_at desc);
