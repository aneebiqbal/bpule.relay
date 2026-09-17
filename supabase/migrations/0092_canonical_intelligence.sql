-- 0092: Relay Intelligence V2 — Canonical Prospect Intelligence
--
-- Adds canonical intelligence persistence to the leads table.
-- Once saved, NO surface may independently recompute the lead score.
-- All surfaces read from canonical_intelligence.

-- ============================================================================
-- CANONICAL INTELLIGENCE COLUMNS
-- ============================================================================

-- Canonical score 0-100 (display /10 is a UI conversion of this)
alter table leads add column if not exists canonical_score integer
  check (canonical_score is null or (canonical_score >= 0 and canonical_score <= 100));

-- Scoring model version (e.g. 'relay_qualification_v2')
alter table leads add column if not exists score_version text;

-- When the canonical score was last computed
alter table leads add column if not exists scored_at timestamptz;

-- Full canonical intelligence object (the single source of truth)
alter table leads add column if not exists canonical_intelligence jsonb;

-- Raw source data preserved separately from normalized extraction
alter table leads add column if not exists raw_source_data jsonb;

-- Score breakdown for transparent explanation
alter table leads add column if not exists score_breakdown jsonb;

-- Remote eligibility assessment
alter table leads add column if not exists remote_eligibility jsonb;

-- Source/evidence ledger
alter table leads add column if not exists evidence_ledger jsonb;

-- Extraction completeness assessment
alter table leads add column if not exists extraction_completeness jsonb;

-- Re-score event history (append-only)
alter table leads add column if not exists rescore_events jsonb[] not null default '{}';

-- ============================================================================
-- INDEXES
-- ============================================================================

create index if not exists leads_canonical_score_idx on leads(canonical_score);
create index if not exists leads_score_version_idx on leads(score_version);
create index if not exists leads_scored_at_idx on leads(scored_at);

-- ============================================================================
-- RPC: Append rescore event atomically
-- ============================================================================

create or replace function public.append_rescore_event(
  p_lead_id uuid,
  p_canonical_score int,
  p_score_version text,
  p_score_breakdown jsonb,
  p_rescore_event jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update leads
  set
    canonical_score = p_canonical_score,
    score_version = p_score_version,
    scored_at = now(),
    score_breakdown = p_score_breakdown,
    rescore_events = array_append(coalesce(rescore_events, '{}'), p_rescore_event)
  where id = p_lead_id;
end;
$$;

-- ============================================================================
-- RLS — inherits existing leads policies (no new policies needed)
-- ============================================================================
