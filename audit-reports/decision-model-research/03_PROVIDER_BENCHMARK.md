# Provider Benchmark Results

**Date:** 2026-10-01  
**Dataset:** 39 frozen examples (all regression classes represented)  
**Benchmark:** Deterministic fallback vs V2 proxy logic

## Head-to-Head Metrics

| Metric | Deterministic Fallback | V2 Proxy | Delta |
|--------|----------------------|----------|-------|
| Relationship Accuracy | 69% | 69% | — |
| Buyer Request Accuracy | 67% | 59% | +8% det |
| Buyer Request Precision | 63% | 80% | +17% v2 |
| **Buyer Request Recall** | **90%** | **40%** | **+50% det** |
| **Buyer Request F1** | **0.74** | **0.53** | **+0.21 det** |
| Need Owner Accuracy | 72% | 67% | +5% det |
| Message Eligible Accuracy | 79% | 79% | — |
| Action Accuracy | 46% | 49% | +3% v2 |
| SP False Buyer Rate | 11% | 0% | +11% v2 |
| SP False Message Rate | 11% | 0% | +11% v2 |
| Median Latency | 0.01ms | 0ms | — |
| Avg Latency | 0.08ms | 0.01ms | — |

## Critical Findings

### 1. V2's Explicit Buyer Recall is Catastrophic (40%)

V2 misses 6 out of 10 explicit buyer requests. This is the SERVICE_PROVIDER → 0 bug:
- When V2 detects service language, it forces buyer probability to 0.05 regardless of hiring signals
- Explicit hiring + apply instructions with service context still gets buyer=0.45 (below threshold)

**Deterministic fallback catches 9/10 explicit buyers (90% recall).**

### 2. V2's Precision Comes at Unacceptable Cost

V2 achieves 80% precision by being extremely conservative — classifying almost everything as SKIP. This means:
- Fewer false positives
- But 60% of real opportunities are missed
- The "precision" is an artifact of over-classification as negative

### 3. Service Provider False Buyer Rate

| Provider | SP Examples | False Buyers | Rate |
|----------|-------------|--------------|------|
| Deterministic | 9 (SP + COMPETITOR) | 1 | 11% |
| V2 Proxy | 9 | 0 | 0% |

Deterministic's one false buyer: `recruiter-001` (classified MIXED with buyer=0.6 because "hiring" appears in recruiter context). This is a hard case — a recruiter posting about "open roles" looks like hiring language.

### 4. Both Providers Struggle with Action Accuracy (~47%)

Neither provider reliably derives the correct action. This suggests:
- Action policy needs its own decision layer
- Action depends on dimensions neither provider fully captures (fit, access quality)
- Deterministic action rules are too coarse

## Failure Analysis

### Deterministic Failures (17/39 incorrect on relationship OR buyer request)

| Example | Issue | Root Cause |
|---------|-------|------------|
| buyer-005 | Signal "scaling" not recognized | Growth language not mapped to buyer |
| sp-004 | "management consulting" → COMPETITOR | Pattern matched consulting as competitor |
| comp-002 | e-GP portal not detected as service | Domain-specific language |
| multi-003 | Buyer prob 0.6 → 0.36 (stale dampening) | Over-aggressive staleness multiplier |
| nonbuy-001 | "demand for developers" → BUYER | Hiring-related words in market context |
| nonbuy-003 | Recruiter → UNKNOWN | Market stats not recognized as service |
| recruiter-001 | Recruiter post → MIXED (false positive) | "open roles" matched hiring pattern |
| nontech-001 | "need someone to build" → BUYER | Generic "need" + "build" pattern |
| contr-001 | Contradictory posts → BUYER | No negation/contradiction detection |
| repost-001 | "Another company hiring" → BUYER | Repost attribution not detected |
| vendor-001 | "vendor shortlist" → UNKNOWN | Procurement language not recognized |
| otw-001 | "#OpenToWork" → BUYER | "looking for" matched hiring pattern |

### Common Failure Modes

1. **Market commentary with hiring keywords** — "demand for developers" triggers buyer
2. **Recruiter service language** — "open roles", "hiring" in recruiter context
3. **Reposts** — "Another company is hiring" attributed to poster
4. **Contradictory evidence** — negation ("paused hiring") not detected
5. **Procurement/vendor language** — "vendor shortlist" not recognized as buyer
6. **Generic "need" patterns** — non-technical "need someone" triggers buyer
7. **Domain-specific services** — e-GP portal, management consulting

## What This Means for Model Selection

### Deterministic rules hit a ceiling at ~69% relationship accuracy

The remaining 31% failures require semantic understanding that regex cannot provide:
- Distinguishing "hiring" in recruiter context vs. buyer context
- Understanding "vendor shortlist" = procurement = buyer intent
- Recognizing reposts vs. original content
- Detecting negation/contradiction across multiple statements

### An LLM decision model should specifically improve:

| Failure Class | Count | LLM Should Solve? |
|---------------|-------|-------------------|
| Market commentary misread | 2 | Yes — understand context |
| Recruiter misclassified | 2 | Yes — understand service model |
| Repost misattribution | 1 | Yes — understand attribution |
| Contradictory not detected | 1 | Yes — temporal reasoning |
| Procurement not recognized | 1 | Yes — domain vocabulary |
| Non-technical "need" false positive | 2 | Yes — semantic precision |
| Growth language missed | 1 | Yes — understand scaling signals |

### Jeff/Kev expected improvement: +15-25% on relationship accuracy

Based on published benchmarks (Jeff 0.8B ~79% on generic classification, Kev-4B ~84%):
- Should reach 80-85% relationship accuracy on Relay's specific categories
- Buyer request recall should exceed 95%
- Service provider false buyer rate should stay below 10%
- Calibrated probabilities enable proper confidence routing

## Embedding + Logistic Regression Baseline

Not yet run (requires embedding provider). Expected performance:
- Relationship accuracy: 70-80% (competitive with Jeff for narrow categories)
- Latency: <1ms
- Cost: $0
- Should be benchmarked before committing to Jeff/Kev

## Recommended Next Steps

1. Run OpenAI structured classifier on same frozen set
2. Run LongCat structured classifier on same frozen set
3. Run Jeff-Qwen3.5-0.8B on same frozen set
4. Run Qwen3-Embedding-0.6B + logistic regression on same frozen set
5. Compare all providers on identical metrics
6. Select primary + fallback based on Relay data, not public benchmarks
