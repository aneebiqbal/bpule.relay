-- 20261006000000: Score observability + data cleanup
--
-- 1. Add observability columns for full score traceability
-- 2. Fix existing data where canonical scores were stored in the legacy score column

-- Observability columns
alter table leads add column if not exists decision_provider text;
alter table leads add column if not exists decision_model text;
alter table leads add column if not exists decision_run_id text;
alter table leads add column if not exists selected_episode_id text;
alter table leads add column if not exists profile_match_score integer check (profile_match_score between 0 and 100);
alter table leads add column if not exists profile_match_version text;
alter table leads add column if not exists best_profile_id uuid references profiles(id);
alter table leads add column if not exists best_profile_match_score integer check (best_profile_match_score between 0 and 100);
alter table leads add column if not exists intelligence_input_hash text;
alter table leads add column if not exists v3_reuse_key text;
alter table leads add column if not exists fallback_reason text;

-- Fix existing data: score column must hold legacy 0-12 only.
--
-- Case 1: score > 12 AND canonical_score IS NULL
--   → canonical value was stored in score column only. Move it.
update leads
set canonical_score = score,
    score = null,
    score_version = 'relay_decision_v3.0.0',
    scored_at = coalesce(scored_at, now())
where score > 12
  and canonical_score is null;

-- Case 2: score > 12 AND canonical_score = score (same value in both columns)
--   → canonical was duplicated into score column. Clear score (canonical_score is authority).
update leads
set score = null
where score > 12
  and canonical_score is not null
  and canonical_score = score;

-- Case 3: score > 12 AND canonical_score IS NOT NULL AND canonical_score != score
--   → conflicting values. Keep canonical_score (authority), clear score.
--   This should not happen, but if it does, canonical wins.
update leads
set score = null
where score > 12
  and canonical_score is not null
  and canonical_score != score;

-- Indexes for deterministic reuse lookups
create index if not exists idx_leads_intelligence_input_hash
  on leads(intelligence_input_hash)
  where intelligence_input_hash is not null;

create index if not exists idx_leads_v3_reuse_key
  on leads(v3_reuse_key)
  where v3_reuse_key is not null;
