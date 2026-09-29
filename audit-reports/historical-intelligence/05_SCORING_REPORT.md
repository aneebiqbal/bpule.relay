# 05 — SCORING REPORT

## Score Distribution Analysis

### Canonical Scores (relay_qualification_v2)

| Band | Count | Percentage |
|------|-------|------------|
| 81-100 (Strong/Worth pursuing) | 59 | 30.9% |
| 61-80 | 109 | 57.1% |
| 41-60 (Maybe/Weak fit) | 16 | 8.4% |
| 21-40 | 5 | 2.6% |
| 0-20 (Not a fit) | 2 | 1.0% |

### Problem: Severe Score Inflation

**88% of scored leads (168/191) score above 60.** This is not a realistic
distribution for cold outreach prospects. In a healthy pipeline:

- 81-100: Expected 5-15% | Actual: 30.9%
- 61-80: Expected 15-25% | Actual: 57.1%
- 0-40: Expected 50-70% | Actual: 12.0%

### Dimension Averages

| Dimension | Avg Points | Max | Avg % |
|-----------|-----------|-----|-------|
| opportunityFit | 14.7 | 20 | 73.5% |
| remoteEligibility | 16.2 | 20 | 81.0% |
| needIntent | 14.0 | 20 | 70.0% |
| revenueIdentityFit | 12.7 | 15 | 84.7% |
| proofStrength | 5.2 | 10 | 52.0% |
| accessReachability | 2.8 | 5 | 56.0% |
| timing | 3.7 | 5 | 74.0% |
| conversionEvidence | 3.2 | 5 | 64.0% |

**All dimensions are systematically inflated.** No dimension averages below 50%.

### Score vs Evaluator Agreement

| Category | Count | Percentage |
|----------|-------|------------|
| REASONABLE | 126 | 65.9% |
| MODERATE_OVER_SCORE | 42 | 22.0% |
| SEVERE_OVER_SCORE | 42 | 22.0% |
| UNDER_SCORE | 0 | 0% |
| N/A (no score) | 0 | 0% |

### Over-Scoring Root Causes

1. **Competitor Misclassification (57 leads)**: Companies doing software
   development themselves scored as high as 82-91. The system doesn't
   distinguish between "builds software" and "buys software development".

2. **Evidence Inflation**: The evidence ledger contains scoring dimension
   labels as "evidence" (190/191 leads), which inflates the perceived
   evidence quality.

3. **Remote Eligibility Auto-Max**: 81% average on remote eligibility.
   Most leads get full points if the job/company is remote-friendly,
   regardless of whether there's actual buyer intent.

4. **Hiring = Buyer**: Any hiring signal (signal_type=1) is treated as
   evidence of buyer intent, even when the person is hiring for their
   own engineering team.

### Legacy Score Problem

The legacy scoring (score column) is severely broken:
- 217 out of 291 leads (74.6%) have the maximum score of 10-12
- This was likely a seed/test dataset issue

### Specific Over-Score Examples

| Lead | Company | Score | Issue |
|------|---------|-------|-------|
| Michel Borges | Cloud2Gether | 91 | He's a fractional CTO offering services, not buying |
| Manny Morales | 101domain.com | 90 | Systems Architect, technical role |
| Charles Packer | Letta | 90 | Co-Founder of AI company hiring for own team |
| Nicholas Miller | Qualia | 89 | Director of Engineering hiring for own team |
| Andreas Leicher | Kotaicode GmbH | 89 | Founder of software consultancy |
| Yani Iliev | ServMask Inc. | 82 | Software development company |
| Nicholas Sugianto | Jobsuit.ai | 82 | Founder of tech company hiring |
| Adil Mahmood | Code Graphers | 61 | Co-founder of software dev company |

---

## Scoring Version History

All 191 scored records use **relay_qualification_v2**.
No historical score version comparison is possible (all data from September 2026).

