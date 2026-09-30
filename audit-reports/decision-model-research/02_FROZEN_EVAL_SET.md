# Frozen Evaluation Set — Methodology & Distribution

**Date:** 2026-10-01  
**File:** `scripts/decision-v3-research/frozen-eval-data.mjs`  
**Count:** 39 high-confidence examples

## Sources

| Source | Count | Label Quality |
|--------|-------|--------------|
| golden-dataset.json (evidenced WON/STRONG) | 5 | High — real client history |
| hardening-regression fixtures (CI-tested invariants) | 9 | High — proven failures |
| adversarial fixtures (multi-role, multi-org) | 14 | High — designed edge cases |
| audit-derived (reanalysis queue labels) | 3 | High — human auditor decisions |
| production test profiles | 8 | Medium — expected ranges |

## Category Distribution

| Category | Count | Class |
|----------|-------|-------|
| genuine_buyer | 4 | Positive |
| explicit_freelance | 2 | Positive |
| service_provider | 1 | Negative |
| fractional_cto | 1 | Negative |
| engineering_services | 1 | Negative |
| consulting_firm | 1 | Negative |
| it_consulting | 1 | Negative |
| competitor_dev_shop | 1 | Negative |
| competitor_eGP | 1 | Negative |
| recruiter | 1 | Negative |
| recruiter_market_stats | 1 | Negative |
| service_provider_plus_hiring | 1 | Mixed |
| agency_outsourcing | 1 | Mixed |
| same_person_multiple_orgs | 1 | Mixed |
| founder_job_seeking | 1 | Mixed |
| market_commentary | 1 | Negative |
| customer_need_not_self | 1 | Negative |
| technical_founder_no_need | 1 | Negative |
| non_technical | 1 | Negative |
| stale_hiring_with_apply | 1 | Timing |
| contradictory_posts | 1 | Contradiction |
| geo_restricted | 1 | Structural |
| weak_evidence | 1 | Weak |
| repost_not_attributable | 1 | Attribution |
| customer_discovery | 1 | Negative |
| product_launch_no_need | 1 | Negative |
| building_in_public | 1 | Negative |
| capacity_request | 1 | Positive |
| hiring_own_team_not_outsourcing | 1 | Weak positive |
| vendor_evaluation | 1 | Positive |
| non_technical_micro_business | 1 | Negative |
| open_to_work | 1 | Negative |
| partnership_request | 1 | Mixed |
| old_role_vs_current | 1 | Temporal |

## Label Distribution

### Relationship
| Label | Count |
|-------|-------|
| BUYER | 13 |
| UNKNOWN | 12 |
| SERVICE_PROVIDER | 7 |
| MIXED | 3 |
| COMPETITOR | 2 |
| PARTNER | 1 |
| CANDIDATE | 1 |

### Buyer Request
| Label | Count |
|-------|-------|
| NONE | 19 |
| EXPLICIT | 10 |
| WEAK | 6 |
| STRONG | 4 |

### Message Eligibility
| Label | Count |
|-------|-------|
| NO | 23 |
| YES | 10 |
| HUMAN_REVIEW | 6 |

## Coverage of Required Regression Classes

| Required Class | Present | Example IDs |
|----------------|---------|-------------|
| service provider + no buyer event | Yes | sp-001 through sp-005 |
| service provider + explicit hiring event | Yes | multi-001 |
| competitor + hiring event | Yes | comp-001, comp-002 |
| agency + outsourcing request | Yes | multi-002, agency-outsourcing |
| founder + job seeking | Yes | jobs-001 |
| founder + customer problem only | Yes | nonbuy-002 |
| technical founder + no need | Yes | nonbuy-004 |
| explicit freelance request | Yes | buyer-003, upwork-001 |
| expired hiring post | Yes | stale-001 |
| current direct apply | Yes | buyer-004 |
| customer need ≠ self need | Yes | nonbuy-002 |
| market commentary ≠ buyer need | Yes | nonbuy-001 |
| same person across multiple companies | Yes | multi-003 |
| contradictory posts | Yes | contr-001 |
| weak evidence | Yes | weak-001 |
| recruiter | Yes | recruiter-001, nonbuy-003 |
| non-technical profile | Yes | nontech-001, micro-001 |

## Known Gaps (need more examples for production benchmark)

- Near-duplicate leads (same person, different company mentions) — 1 example
- Foreign language profiles — 0 examples
- Fraud/crypto payment patterns — 0 examples
- Extremely long LinkedIn dumps — 0 examples
- Multiple posts from same person spanning months — partial

Target: expand to 100+ examples before final model selection.
