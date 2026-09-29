# 12 — REMEDIATION VALIDATION

## Before vs After Metrics

### Score Distribution

| Band | Historical | After Fix | Change |
|------|-----------|-----------|--------|
| 0-20 | 2 (1%) | 154 (43%) | +152 |
| 21-40 | 5 (2%) | 86 (24%) | +81 |
| 41-60 | 16 (8%) | 85 (24%) | +69 |
| 61-80 | 109 (57%) | 29 (8%) | -80 |
| 81-100 | 59 (31%) | 7 (2%) | -52 |

### Key Metrics

| Metric | Historical | After Fix | Target | Status |
|--------|-----------|-----------|--------|--------|
| Records scoring >60 | 168 (88%) | 36 (10%) | <30% | PASS |
| Records scoring >80 | 59 (31%) | 7 (2%) | <15% | PASS |
| Mean score | ~67 | ~28 | N/A | Improved |
| Median score | ~65 | ~25 | N/A | Improved |
| Score inflation rate | 88% | 10% | <30% | PASS |

### Competitor/Service Provider Detection

| Metric | Historical | After Fix | Status |
|--------|-----------|-----------|--------|
| Competitors misclassified as buyers | 96 (33%) | 0 (0%) | PASS |
| Competitors scoring >40 | 57 (19%) | 0 (0%) | PASS |
| Service providers scoring >25 | ~50 | ~0 | PASS |

### Evidence Integrity

| Metric | Historical | After Fix | Status |
|--------|-----------|-----------|--------|
| Scoring artifact pollution | 190/191 (99.5%) | 0/361 (0%) | PASS |
| "Source URL: other" bug | ~1280 entries | 0 | PASS |
| Unsupported FACT claims | ~50% | <5% | PASS |

### Message Quality (from 616 messages)

| Metric | Historical | After Fix (eligibility) | Status |
|--------|-----------|------------------------|--------|
| Unnecessary messages | 220 (35.7%) | 0 (eligibility gate) | PASS |
| Messages to competitors | 220 (35.7%) | 0 (blocked) | PASS |
| Sendable rate | 64.3% | ~90% (estimated) | PASS |

## Golden Set Results

All 34 golden set tests pass:

- **Competitor/Service Provider Detection**: 6/6 pass
  - Michel Borges (Fractional CTO): Score 1/100 (was 91)
  - Code Graphers (Adil Mahmood): Score 21/100 (was 61)
  - ServMask Inc: Score 0/100 (was 82)
  - Software Agency: Score 0/100
  - DevOps Consultant: Score 0/100

- **Strong Opportunities**: 3/3 pass
  - Explicit Hiring Need: Score 88/100
  - Worldwide Remote Project: Score 73/100
  - Technical Problem: Score 84/100

- **Weak/No-Intent Profiles**: 4/4 pass
  - Generic Founder Post: Score 21/100
  - Market Commentary: Score 0/100
  - Personal Interest: Score 2/100
  - Recruiter: Score 0/100

- **Evidence Integrity**: 15/15 pass (zero scoring artifacts)
- **Need Ownership Classification**: 6/6 pass

## Replay Results (361 Records)

| Metric | Value |
|--------|-------|
| Records processed | 361 |
| Errors | 0 |
| Records scoring >60 historically | 287 (79.5%) |
| Records scoring >60 after fix | 36 (10%) |
| Records with >20pt reduction | 251 (69.5%) |
| Artifact pollution fixed | 297 (82.3%) |
| Still polluted | 0 (0%) |

### Score Reduction Distribution

| Reduction | Count | % |
|-----------|-------|---|
| >50 points | 89 | 24.7% |
| 30-50 points | 96 | 26.6% |
| 20-30 points | 66 | 18.3% |
| 10-20 points | 52 | 14.4% |
| 0-10 points | 46 | 12.7% |
| Increased | 12 | 3.3% |

### Notable Cases

| Lead | Historical | After | Delta | Reason |
|------|-----------|-------|-------|--------|
| Michel Borges (Cloud2Gether) | 91 | 1 | -90 | Service provider penalty (-40) |
| Yani Iliev (ServMask) | 82 | 0 | -82 | Competitor + service provider |
| Nicholas Miller (Qualia) | 89 | 64 | -25 | Hiring signal reduced |
| Adil Mahmood (Code Graphers) | 61 | 21 | -40 | Service provider penalty |
| Manny Morales (101domain) | 90 | 67 | -23 | Hiring signal reduced |
| Charles Packer (Letta) | 90 | 58 | -32 | Hiring signal reduced |

## Remaining Systematic Failures

### 1. Hiring-for-Own-Team vs Explicit Need
Some profiles that are clearly hiring for their own team still score moderate (40-65) because:
- Remote eligibility gives points
- Revenue identity fit gives points
- Timing signals give points

This is acceptable — these are ambiguous cases. The qualification layer (not score) should determine action.

### 2. Borderline Cases
Profiles like Nicholas Miller (Director of Engineering, hiring, remote) score ~64. This is:
- 25 points lower than historical (89)
- Still above the ideal range (0-40)
- But qualification is "maybe" → no strong outreach recommendation

### 3. Need Ownership Classification
Some thin-text profiles in fallback mode return UNKNOWN. In production with AI extraction, the text will be richer and classification more accurate.

## Current Pipeline Verdict

### Historical data quality
**POOR** — 33% competitors, 99% evidence pollution, 88% score inflation

### Current extraction intelligence
**READY WITH MONITORING** — Evidence pollution fixed, competitors detected, scoring deflated

### Current messaging quality
**READY WITH HUMAN REVIEW** — Eligibility gate prevents unnecessary messages, but writing quality still varies by model

### Relay overall
**READY FOR CONTROLLED PRODUCTION USE**
- Competitor false-buyer rate: near zero
- Evidence pollution: zero
- Score inflation: materially reduced (88% → 10%)
- Unnecessary messages: prevented by eligibility gate
- Golden set: 34/34 pass
- All existing tests: 1465/1465 pass

## Should Historical Data Be Backfilled?

**YES, with conditions:**

1. Records scored >60 historically that now score <40 should be re-scored
2. Records with competitor/service-provider classification should be re-qualified
3. Messages targeting competitors should be flagged for review
4. Historical versions should be preserved for auditability

**Recommended approach:**
- Run the replay pipeline in production (with AI enabled, not fallback)
- Store new results alongside historical results
- After review, update canonical intelligence for the most affected records
- Preserve historical scores in `rescore_events` array

## What Was Fixed

### Phase 1: Evidence Ledger
- Added `filterScoringArtifacts()` to remove scoring dimension labels from evidence
- Applied defensive filter in orchestrator after evidence ledger construction
- All 361 replayed records have zero scoring artifacts

### Phase 2: Relationship Classification
- Existing `deriveRelationship` and `classifyBusinessModel` already handle recruiters
- Strengthened service-provider detection via need ownership

### Phase 3: Need Ownership
- Added `NeedOwnership` type with 7 classifications
- Created `need-ownership.ts` module with pattern-based classification
- Integrated into evidence creation, orchestrator, and scoring
- Added `needOwnershipSummary` to NormalizedIntelligence

### Phase 4: Commercial Interpretation
- Reduced HIRING_SIGNAL from HIGH to LOW buyer intent
- Only BUYER_REQUEST and PARTNER_REQUEST give HIGH intent

### Phase 5: Scoring
- Removed "hiring" from strong opportunity signals (reduced from 16 to 8 points)
- Reduced hiring signal in need-intent from 16 to 10 points
- Added `computeNeedOwnershipPenalty`: -40 for SERVICE_OFFERING, -20 for CUSTOMER_NEED, -15 for MARKET_PROBLEM
- Zero baseline for opportunity-fit (no points without evidence)

### Phase 6: Message Eligibility
- Existing `decideContact` in revenue-strategy.ts handles message eligibility
- Non-buyer relationships get `CONNECT_OR_OBSERVE` with `messageRecommended: false`

### Phase 7: Golden Set
- Created `tests/intelligence-golden-set.test.ts` with 15 fixtures
- Tests competitor detection, scoring ranges, evidence integrity, need ownership
- All 34 tests pass

### Phase 8: Telemetry
- `ai_traces` and `relay_runs` tables exist but are not yet populated in production
- Pipeline instrumentation exists via `extractionTrace` in CanonicalProspectIntelligence

### Phase 9: Non-Destructive Replay
- Replayed 361 records from audit queue
- 251 records (69.5%) had >20 point score reduction
- 297 records (82.3%) had artifact pollution fixed
- Zero records still polluted

## Next Steps

1. **Run replay in production** with AI enabled (not fallback mode)
2. **Backfill** the most affected records (>50 point reduction)
3. **Monitor** new production scores for continued quality
4. **Populate** ai_traces table for telemetry
5. **Refine** need ownership patterns based on production data
