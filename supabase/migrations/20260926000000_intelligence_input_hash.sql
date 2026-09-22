-- 20260926: Intelligence input-hash reuse boundary
--
-- Relay hardening sprint, Phase 6 (stable input hashing).
--
-- Problem: produceCanonicalIntelligence() (src/lib/intelligence-v2/orchestrator.ts)
-- is invoked fresh on every /api/prospect/analyze and /api/leads/extract call,
-- with no memory of prior runs. Re-pasting the exact same source text (retry
-- after a slow response, re-analyzing the same profile days later, etc.)
-- always re-runs the full LLM extraction pipeline, fully exposed to whatever
-- provider/model/sampling variance exists — in violation of the invariant
-- "same canonical evidence + same versions = same canonical intelligence."
--
-- This migration adds the persistence side of the fix: a deterministic hash
-- of the normalized input (+ the pipeline/scoring versions that legitimately
-- affect the result), stored alongside the canonical intelligence it produced,
-- so a later request with an identical hash can reuse the persisted result
-- instead of invoking the AI pipeline again. See
-- src/lib/intelligence-v2/input-hash.ts for the hashing logic and
-- src/app/api/prospect/analyze/route.ts / src/app/api/leads/extract/route.ts
-- for where reuse is checked.
--
-- Purely additive: one nullable column + one index. No backfill required —
-- existing leads simply have no hash on file and are never matched for reuse
-- (a NULL hash never equals another NULL hash in an equality lookup), which
-- is the correct default: we never want to silently attach an unverified
-- historical lead to a fresh analyze request.

alter table leads add column if not exists intelligence_input_hash text;

create index if not exists leads_intelligence_input_hash_idx
  on leads(intelligence_input_hash)
  where intelligence_input_hash is not null;

comment on column leads.intelligence_input_hash is
  'sha256 of normalized source text + intelligence pipeline version + score version. '
  'Same hash + same versions => the persisted canonical_intelligence may be reused '
  'instead of re-invoking the AI extraction pipeline. Never reused across '
  'organizations (queries scoped by organization_id as with all lead lookups).';
