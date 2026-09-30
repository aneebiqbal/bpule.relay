# V3 Multi-Model Cascade Benchmark

Generated: 2026-09-30T22:38:28.457Z
Dataset: 105 frozen examples
Models: gpt-4o-mini, gpt-4o, gpt-4.1
Strategies: A (mini only), B (4o only), C (4.1 only), D (mini→4o), E (mini→4.1)

## A: gpt-4o-mini only

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Buyer Precision | 0.7 | >= 0.60 | PASS |
| Buyer Recall | 0.91 | >= 0.90 | PASS |
| Buyer F1 | 0.79 | >= 0.75 | PASS |
| Relationship Macro-F1 | 0.42 | >= 0.80 | FAIL |
| Need-Owner Accuracy | 0.46 | >= 0.60 | FAIL |
| Explicit-Buyer FNR | 0.11 | <= 0.10 | FAIL |
| SP False-Buyer (semantic) | 0.22 | <= 0.10 | FAIL |
| SP False-Send (post-policy) | 0 | <= 0.05 | PASS |
| Msg-Eligibility Precision | 1 | >= 0.90 | PASS |
| Dangerous False-Send | 0 | <= 0.02 | PASS |
| Brier Score | 0.151 | <= 0.15 | FAIL |
| ECE | 0.132 | <= 0.10 | FAIL |
| p50 Latency (ms) | 1037 | <= 1500 | PASS |
| p95 Latency (ms) | 1801 | <= 4000 | PASS |
| Escalation Rate | 0 | < 0.30 | PASS |

**9/15 criteria passed**

## B: gpt-4o only

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Buyer Precision | 0.73 | >= 0.60 | PASS |
| Buyer Recall | 0.84 | >= 0.90 | FAIL |
| Buyer F1 | 0.78 | >= 0.75 | PASS |
| Relationship Macro-F1 | 0.46 | >= 0.80 | FAIL |
| Need-Owner Accuracy | 0.6 | >= 0.60 | PASS |
| Explicit-Buyer FNR | 0.17 | <= 0.10 | FAIL |
| SP False-Buyer (semantic) | 0.09 | <= 0.10 | PASS |
| SP False-Send (post-policy) | 0 | <= 0.05 | PASS |
| Msg-Eligibility Precision | 0.6 | >= 0.90 | FAIL |
| Dangerous False-Send | 0.01 | <= 0.02 | PASS |
| Brier Score | 0.148 | <= 0.15 | PASS |
| ECE | 0.101 | <= 0.10 | FAIL |
| p50 Latency (ms) | 1200 | <= 1500 | PASS |
| p95 Latency (ms) | 1832 | <= 4000 | PASS |
| Escalation Rate | 0 | < 0.30 | PASS |

**10/15 criteria passed**

## C: gpt-4.1 only

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Buyer Precision | 0.74 | >= 0.60 | PASS |
| Buyer Recall | 0.91 | >= 0.90 | PASS |
| Buyer F1 | 0.81 | >= 0.75 | PASS |
| Relationship Macro-F1 | 0.46 | >= 0.80 | FAIL |
| Need-Owner Accuracy | 0.6 | >= 0.60 | PASS |
| Explicit-Buyer FNR | 0.11 | <= 0.10 | FAIL |
| SP False-Buyer (semantic) | 0.13 | <= 0.10 | FAIL |
| SP False-Send (post-policy) | 0.04 | <= 0.05 | PASS |
| Msg-Eligibility Precision | 0.43 | >= 0.90 | FAIL |
| Dangerous False-Send | 0.04 | <= 0.02 | FAIL |
| Brier Score | 0.134 | <= 0.15 | PASS |
| ECE | 0.085 | <= 0.10 | PASS |
| p50 Latency (ms) | 901 | <= 1500 | PASS |
| p95 Latency (ms) | 1405 | <= 4000 | PASS |
| Escalation Rate | 0 | < 0.30 | PASS |

**10/15 criteria passed**

## D: mini→4o cascade

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Buyer Precision | 0.7 | >= 0.60 | PASS |
| Buyer Recall | 0.88 | >= 0.90 | FAIL |
| Buyer F1 | 0.78 | >= 0.75 | PASS |
| Relationship Macro-F1 | 0.48 | >= 0.80 | FAIL |
| Need-Owner Accuracy | 0.51 | >= 0.60 | FAIL |
| Explicit-Buyer FNR | 0.11 | <= 0.10 | FAIL |
| SP False-Buyer (semantic) | 0.17 | <= 0.10 | FAIL |
| SP False-Send (post-policy) | 0 | <= 0.05 | PASS |
| Msg-Eligibility Precision | 1 | >= 0.90 | PASS |
| Dangerous False-Send | 0 | <= 0.02 | PASS |
| Brier Score | 0.15 | <= 0.15 | PASS |
| ECE | 0.097 | <= 0.10 | PASS |
| p50 Latency (ms) | 1062 | <= 1500 | PASS |
| p95 Latency (ms) | 2348 | <= 4000 | PASS |
| Escalation Rate | 0.19 | < 0.30 | PASS |

**10/15 criteria passed**

## E: mini→4.1 cascade

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Buyer Precision | 0.72 | >= 0.60 | PASS |
| Buyer Recall | 0.95 | >= 0.90 | PASS |
| Buyer F1 | 0.82 | >= 0.75 | PASS |
| Relationship Macro-F1 | 0.49 | >= 0.80 | FAIL |
| Need-Owner Accuracy | 0.5 | >= 0.60 | FAIL |
| Explicit-Buyer FNR | 0.06 | <= 0.10 | PASS |
| SP False-Buyer (semantic) | 0.22 | <= 0.10 | FAIL |
| SP False-Send (post-policy) | 0 | <= 0.05 | PASS |
| Msg-Eligibility Precision | 0.75 | >= 0.90 | FAIL |
| Dangerous False-Send | 0.01 | <= 0.02 | PASS |
| Brier Score | 0.133 | <= 0.15 | PASS |
| ECE | 0.121 | <= 0.10 | FAIL |
| p50 Latency (ms) | 1043 | <= 1500 | PASS |
| p95 Latency (ms) | 1659 | <= 4000 | PASS |
| Escalation Rate | 0.16 | < 0.30 | PASS |

**10/15 criteria passed**
