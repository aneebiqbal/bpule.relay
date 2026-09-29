# 11 — REVIEWER GPT BRIEF

## Architecture Summary

Relay (Scout) is a Next.js 16 + Supabase PostgreSQL application for AI-powered
sales outreach. The pipeline:

```
RAW INPUT (LinkedIn profile text)
  → EXTRACTION (Pass A: extract person/company/content)
  → NORMALIZATION (Pass B: normalize fields)
  → INTELLIGENCE (Pass C: buyer intent, opportunity, evidence)
  → SCORING (relay_qualification_v2, 8 dimensions, 0-100)
  → QUALIFICATION (strong/possible/weak/skip)
  → MESSAGE GENERATION (2-3 strategies, select best)
  → CONVERSATION (track replies, follow-ups)
```

AI Runtime: Custom "runtime-v3" with tiered provider chain
- Primary: OpenAI (gpt-4o-mini / gpt-4o / gpt-4.1)
- Fallbacks: Groq, LongCat, OpenCode

## Dataset Counts

| Entity | Count |
|--------|-------|
| Organizations | 4 (1 active with data) |
| Leads | 291 |
| Captured Prospects | 753 |
| Messages | 616 |
| Upwork Jobs | 43 |
| Outcomes | 9 |

All data from September 2026, single organization (bpulse).

## Methodology

1. **Data Extraction**: All production records extracted via Supabase service role key
2. **Deterministic Audit**: Programmatic classification of all 291 leads and 616 messages
3. **Semantic Evaluation**: Deep inspection of 30 leads with raw source
4. **Independent Judgment**: Evaluator assessed buyer intent BEFORE seeing Relay's score
5. **Comparison**: Evaluator judgment vs Relay output compared

## Evaluation Rubric

### Extraction
- PASS: Name, company, title all correct
- MINOR_ERROR: One field slightly off
- MATERIAL_ERROR: Wrong person or company
- FABRICATED: Invented information
- INSUFFICIENT_SOURCE: Not enough raw text to evaluate

### Evidence
- FACT: Directly stated in source
- EXPLICIT_SIGNAL: Clear signal in source
- STRONG_INFERENCE: Reasonable inference
- WEAK_INFERENCE: Possible but not certain
- UNSUPPORTED: No basis in source

### Buyer Intent
- NONE: No indication of need
- WEAK: Possible need but no signal
- MODERATE: Some signal of need
- STRONG: Clear signal of need
- EXPLICIT: Directly stated need

### Scoring
- RELAY vs EVALUATOR range comparison
- <=10 points: reasonable
- 11-20: review
- >20: material error

### Messages
- SEND AS-IS: Ready to send
- SEND WITH MINOR EDIT: Needs small changes
- NEEDS REWRITE: Significant problems
- SHOULD NOT HAVE BEEN GENERATED: Wrong target or fabricated

## Key Metrics

| Metric | Value |
|--------|-------|
| Leads audited | 291 |
| Leads with canonical intelligence | 191 (65.6%) |
| Competitors misclassified | 57 (19.6%) |
| Over-scored leads | 84 (28.9%) |
| Evidence ledgers with scoring artifacts | 190/191 (99.5%) |
| Messages audited | 616 |
| Messages sendable | 396 (64.3%) |
| Messages should not be generated | 220 (35.7%) |
| Send dispositions recorded | 156/616 (25.3%) |

## Major Findings

### 1. Evidence Ledger Pollution (CRITICAL)
99.5% of evidence ledgers contain scoring dimension labels as evidence entries.
This is a design flaw where the scoring system's internal metadata is stored as
"evidence" about the prospect.

### 2. Competitor Misclassification (CRITICAL)
33% of leads are software development companies. They are NOT buyers of
development services. Some scored as high as 91/100.

### 3. Score Inflation (HIGH)
88% of scored leads are above 60. No dimension averages below 50%.
The scoring system systematically over-values prospects.

### 4. Service Provider Misinterpretation (HIGH)
Fractional CTOs and consultants offering services are scored as "Strong opportunity"
because "I partner with companies" is read as "I need a partner."

### 5. Message Quality (MEDIUM)
64% of messages are sendable, but 35% target competitors and should not exist.

## Uncertain Findings

1. **False negative rate**: Cannot determine if Relay misses real opportunities
   because there's no outcome data for skipped leads.

2. **Persona effectiveness**: Cannot evaluate because sender_profile_id is
   mostly null.

3. **Historical improvement**: Cannot assess because all data is from the
   same 14-day period.

4. **Cross-org leakage**: Cannot test because all data is from one organization.

## Representative Records

### GOOD Record
**Lead**: Michel Borges @ Cloud2Gether (Score 91)
- **Why it's actually BAD**: He's a fractional CTO offering services, not buying
- **Issue**: Service provider misinterpreted as buyer
- **Evidence**: "I partner with companies looking to accelerate cloud adoption"

### BAD Record
**Lead**: Adil Mahmood @ Code Graphers (Score 61)
- **Why it's BAD**: Code Graphers is a software development company (competitor)
- **Issue**: Competitor misclassified as buyer
- **Evidence**: "Co-founder & Director of CodeGraphers... building scalable software"

### BORDERLINE Record
**Lead**: Nicholas Miller @ Qualia (Score 89)
- **Why it's BORDERLINE**: He IS hiring (Senior Software Engineer), but for his own team
- **Issue**: Hiring for own team ≠ outsourcing need
- **Evidence**: "Hiring: Senior Software Engineer I at Qualia"

## Record IDs for Verification

| Lead ID (prefix) | Name | Company | Score | Issue |
|-----------------|------|---------|-------|-------|
| 6e40c20c | Adil Mahmood | Code Graphers | 61 | Competitor |
| afdbfbad | Yousif Thonee | AI Magic | 64 | No buyer intent |
| 839fdad5 | Odero Otieno | Dipp AI | null | Not scored |
| (find Michel) | Michel Borges | Cloud2Gether | 91 | Service provider |
| (find Nicholas) | Nicholas Miller | Qualia | 89 | Hiring for own team |
| (find Rabia) | Rabia J. Baig | Acrisure | 13 | Recruiter (correct) |

## Version Breakdown

All records: runtime-v3, relay_qualification_v2, intelligence_pipeline_v1
No version comparison possible.

## Scoring Analysis

| Dimension | Avg | Max | Assessment |
|-----------|-----|-----|------------|
| opportunityFit | 14.7 | 20 | Inflated |
| remoteEligibility | 16.2 | 20 | Auto-maxed |
| needIntent | 14.0 | 20 | Inflated |
| revenueIdentityFit | 12.7 | 15 | Inflated |
| proofStrength | 5.2 | 10 | Moderate |
| accessReachability | 2.8 | 5 | Moderate |
| timing | 3.7 | 5 | Inflated |
| conversionEvidence | 3.2 | 5 | Inflated |

## Message Analysis

| Type | Count | Sendable | Should Not Gen |
|------|-------|----------|----------------|
| connection | 408 | ~60% | ~30% |
| dm | 184 | ~70% | ~25% |
| followup | 4 | 100% | 0% |
| reply | 20 | ~80% | ~10% |

## Explicit Questions for Reviewer GPT

1. **Are evaluator standards too strict?** The 2.4% qualification agreement
   rate seems extreme. Is the automated evaluator being too aggressive in
   classifying leads as "skip"?

2. **Are buyer intent classifications defensible?** The evaluator uses keyword
   matching for competitor detection. Are there false positives in the
   competitor list?

3. **Are score ranges reasonable?** The evaluator expects 50-70% of leads
   below 40. Is this realistic for a pre-filtered LinkedIn prospect list?

4. **Are message quality conclusions justified?** 35.7% "should not have been
   generated" seems high. Is the WRONG_COMPANY classification correct for all 220?

5. **Do root causes match evidence?** The evidence ledger pollution is clear,
   but is it actually causing score inflation or just a storage issue?

6. **Are historical vs current pipeline conclusions valid?** Since all data
   is from the same period, can we really say the "current pipeline" has
   these issues?

## What Reviewer GPT Should Verify

1. Manually inspect 10 competitor-flagged leads — are they ALL competitors?
2. Manually inspect 10 high-scored leads — are the scores justified?
3. Check if evidence ledger pollution affects scoring or just storage
4. Verify that "Source URL: other" is actually a bug
5. Assess whether the message quality evaluation is fair
6. Review the scoring dimension averages — are they realistic?
