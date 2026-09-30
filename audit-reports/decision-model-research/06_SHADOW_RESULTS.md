# Shadow Mode Results

**Date:** 2026-10-01  
**Status:** Shadow infrastructure implemented, not yet running on production data

## Shadow Architecture

```
New Lead → Production V2 (canonical, user-visible)
        → V3 Shadow (parallel, stored, not displayed)
        → Comparison stored in lead record
```

## Implementation

- `V3_SHADOW_CONFIG.enabled` — set via `V3_SHADOW_MODE=true` env var
- `compareShadow()` — compares production vs V3 decisions
- `computeShadowStats()` — aggregates across multiple leads
- `generateShadowReport()` — markdown report for review

## What Gets Stored

```ts
shadow_comparison: {
  productionScore: number,
  productionAction: string,
  v3Score: number,
  v3Action: Action,
  scoreDelta: number,
  actionChanged: boolean,
  productionDecision: string | null
}
```

## Shadow Gate

V3 can become canonical only when:
- ≥100 fresh leads processed in shadow
- Score delta >15 in <10% of cases
- Action changed in <15% of cases
- No regression on golden set
- No regression on adversarial fixtures
- Manual review of all high-impact disagreements completed

## Expected Disagreements

Based on benchmark data, the highest-impact expected disagreements are:

| Scenario | Production (V2) | V3 | Impact |
|----------|----------------|-----|--------|
| Service provider + explicit hiring | SKIP (score ~5-15) | OBSERVE/CONNECT (score 30-50) | False negative → V3 correct |
| Market commentary misread | CONNECT (score 40-50) | SKIP (score 5-15) | False positive → V3 correct |
| Recruiter with hiring language | CONNECT (score 30-40) | SKIP (score 5-10) | False positive → V3 correct |
| Stale explicit hiring | CONTACT (score 60+) | OBSERVE (score 25-40) | Over-eager → V3 correct |
| Capacity request | SKIP (missed) | CONNECT_WITH_NOTE (score 40-55) | False negative → V3 correct |

## Current Frozen Set Performance

On 39 frozen examples:

| Metric | V2 Proxy | Deterministic Fallback | Improvement |
|--------|----------|----------------------|-------------|
| Buyer Request Recall | 40% | 90% | +50% |
| Buyer Request F1 | 0.53 | 0.74 | +0.21 |
| SP False Buyer Rate | 0% | 11% | -11% (acceptable) |
| SP False Message Rate | 0% | 11% | -11% (acceptable) |

**Key insight:** V2's 0% false buyer rate is achieved by missing 60% of real buyers. V3's 11% false buyer rate comes with 90% recall of real buyers. This is the correct tradeoff.

## Pre-Shadow Checklist

- [x] Shadow comparison infrastructure implemented
- [x] V3 orchestrator produces shadow comparison data
- [x] Shadow report generation implemented
- [ ] Run shadow on 100+ production leads
- [ ] Manual review of top-20 disagreements
- [ ] Add failure cases to frozen eval set
- [ ] Verify no P0/P1 regression
