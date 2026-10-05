-- Apply observability columns to production
-- Run this in the Supabase Dashboard SQL Editor if not using `supabase db push`
--
-- This is a supplement to 20261006000000_score_observability.sql which handles
-- the data cleanup. This file contains only the additive DDL.

-- Observability columns for score traceability
ALTER TABLE leads ADD COLUMN IF NOT EXISTS decision_provider text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS decision_model text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS decision_run_id text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS selected_episode_id text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS profile_match_score integer CHECK (profile_match_score BETWEEN 0 AND 100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS profile_match_version text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS best_profile_id uuid REFERENCES profiles(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS best_profile_match_score integer CHECK (best_profile_match_score BETWEEN 0 AND 100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS v3_reuse_key text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fallback_reason text;

-- Indexes for deterministic reuse lookups
CREATE INDEX IF NOT EXISTS idx_leads_v3_reuse_key
  ON leads(v3_reuse_key)
  WHERE v3_reuse_key IS NOT NULL;
