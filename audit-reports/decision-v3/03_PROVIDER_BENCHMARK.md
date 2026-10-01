# V3 Provider Benchmark — Metrics

Generated: 2026-10-01T01:02:52.584Z
Frozen examples: 105
Providers: deterministic_v3

## Dataset Distribution

Total: 105
Relationships: {"BUYER":41,"SERVICE_PROVIDER":19,"COMPETITOR":4,"MIXED":4,"UNKNOWN":34,"CANDIDATE":2,"PARTNER":1}
Buyer Requests: {"EXPLICIT":35,"WEAK":6,"NONE":56,"STRONG":8}
Message Eligible: {"YES":33,"HUMAN_REVIEW":8,"NO":64}

## Metrics: deterministic_v3

| Metric | Value | Pass Criteria | Status |
|--------|-------|---------------|--------|
| Buyer Precision | 0.61 | >= 0.60 | PASS |
| Buyer Recall | 0.51 | >= 0.90 | FAIL |
| Buyer F1 | 0.56 | >= 0.75 | FAIL |
| Relationship Macro-F1 | 0.42 | >= 0.80 | FAIL |
| Need-Owner Accuracy | 0 | >= 0.60 | FAIL |
| SP False-Buyer Rate | 0.13 | <= 0.10 | FAIL |
| Msg-Eligibility Precision | 0.5 | >= 0.90 | FAIL |
| Dangerous False-Send Rate | 0.01 | <= 0.02 | PASS |
| Explicit-Buyer FNR | 0.51 | <= 0.10 | FAIL |
| Brier Score | 0.242 | <= 0.15 | FAIL |
| ECE | 0.138 | <= 0.10 | FAIL |
| Action Agreement | 0.43 | >= 0.60 | FAIL |
| p50 Latency (ms) | 0.01 | <= 100 | PASS |
| p95 Latency (ms) | 0.03 | <= 500 | PASS |

**4/14 criteria passed**

Failed:
- Buyer Recall: 0.51 (need >= 0.90)
- Buyer F1: 0.56 (need >= 0.75)
- Relationship Macro-F1: 0.42 (need >= 0.80)
- Need-Owner Accuracy: 0 (need >= 0.60)
- SP False-Buyer Rate: 0.13 (need <= 0.10)
- Msg-Eligibility Precision: 0.5 (need >= 0.90)
- Explicit-Buyer FNR: 0.51 (need <= 0.10)
- Brier Score: 0.242 (need <= 0.15)
- ECE: 0.138 (need <= 0.10)
- Action Agreement: 0.43 (need >= 0.60)

---

## Overall Verdict

**Some providers fail criteria.** See details above.

Dangerous false-send must be <= 2% for ALL providers before promotion.