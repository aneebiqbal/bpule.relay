# Discovered Failures — Relay Intelligence Benchmark

## Purpose

This document lists failures discovered by the benchmark in the production intelligence pipeline.
**These are NOT fixed here.** They are documented for the Intelligence V2 agent to address.

Each failure includes: the invariant violated, the case(s) that trigger it, the root cause in production code, and the expected fix direction.

---

## Failure 1: Known WON Cases Scored Below "Send" Threshold

**Severity**: HIGH
**Invariant**: Known-win recognition
**Cases**: won-001 through won-020

**Observation**:
Real clients who were actually closed score 7-9/12 on the current rubric — borderline "research_more" instead of "send."

**Root cause**: `src/lib/score/rubric.ts`
- Signal weight for "asking" = 6, "pain" = 5
- Completeness max = 5 (URL, name, title, evidence specificity, quote)
- Region bonus = +2
- Max achievable = 7 + 5 + 2 = 14, clamped to 12
- "Send" threshold = 10

A typical win: signal(6) + URL(1) + name(1) + title(1) + region(2) = 11. But if evidence is vague (no number/year) and no verbatim quote: signal(6) + URL(1) + name(1) + title(1) + region(2) = 11. With evidence missing: 10. With quote missing: still 10.

BUT: A LinkedIn post asking for help often has no "specific" evidence (no number/year in the quote), so evidenceSpecific = false, losing 1 point → 9 = "research_more."

**Expected fix direction**:
- Consider proof-match strength as a scoring factor
- Weight "asking" signal higher when the ask is public (LinkedIn post) vs private
- Add client-quality signals (paid trial, specific scope, repeat engagement)
- Lower threshold for "send" when asking signal is present + proof match exists

---

## Failure 2: Remote Eligibility Not Computed During Extraction

**Severity**: CRITICAL
**Invariant**: Remote eligibility
**Cases**: remote-worldwide-001, remote-restricted-001, remote-restricted-002, remote-hybrid-001, remote-onsite-001

**Observation**:
The extraction pipeline does NOT compute `remoteEligibility` as a field. The `ExtractedLead` type has no `remoteEligibility` field. Remote status is only tracked on `UpworkJob` (`remoteStatus`), not on `Lead`.

**Root cause**:
- `src/lib/ai/extract.ts`: Extraction schema has no remote eligibility field
- `src/lib/domain/types.ts`: `ExtractedLead` type has no `remoteEligibility` field
- `src/lib/score/rubric.ts`: Scoring does not consider remote eligibility
- No code path exists that analyzes location text + job type to determine if a Pakistan-based worker is eligible

**Expected fix direction**:
- Add `remoteEligibility` field to `ExtractedLead`
- Parse location text + remote indicators (e.g., "remote," "work from anywhere," "hybrid," "on-site")
- Distinguish company location from worker eligibility
- Handle: worldwide remote, region-restricted remote, hybrid, on-site, unknown

---

## Failure 3: Company Location Confused with Worker Eligibility

**Severity**: HIGH
**Invariant**: Worldwide remote marked ineligible because company is abroad
**Cases**: remote-worldwide-001 (company is "Remote (Worldwide)" — should be eligible), strong-004 (company in India, but hiring remotely)

**Observation**:
Current scoring penalizes non-US/UK/EU/AU locations via `mapLocationToRegion` which returns `outside_core` for locations like India, Pakistan, etc. This gives -2 points.

A company in Bangalore hiring a remote developer should NOT be marked ineligible just because the company is in India. The worker (in Pakistan) can still work remotely for an Indian company.

**Root cause**: `src/lib/leads/targeting.ts:mapLocationToRegion()`
- `OUTSIDE_MARKERS` includes 'pakistan', 'india', etc.
- `regionPoints = region === 'outside_core' ? -2 : region === 'unknown' ? 0 : 2`
- This is a SCORING penalty, not an eligibility check
- The system conflates "is this a core market?" with "can we work with them?"

**Expected fix direction**:
- Separate scoring (market value) from eligibility (can we work with them?)
- A company in India hiring remotely IS eligible for a Pakistan-based worker
- "Outside core" should affect score (maybe) but NOT eligibility
- Remote eligibility should be determined by the job's remote policy, not the company's location

---

## Failure 4: Explicit Restrictions Not Parsed

**Severity**: HIGH
**Invariant**: Explicit US-only remote marked worldwide
**Cases**: remote-restricted-001 ("Must be based in the US"), remote-restricted-002 ("Must be located in EU/EEA")

**Observation**:
When a job explicitly states "US only" or "EU/EEA only" restrictions, the current pipeline has no mechanism to:
1. Detect the restriction
2. Mark the lead as ineligible for non-qualified workers
3. Store the restriction reason

**Root cause**:
- No field in `ExtractedLead` for `locationRestriction` or `eligibilityRequirement`
- Extraction prompt in `src/lib/ai/extract.ts` does not ask for restriction detection
- Scoring does not consider restrictions

**Expected fix direction**:
- Add `locationRestriction` field to extraction schema
- Parse explicit restrictions: "US only," "EU only," "based in," "must be located in"
- Mark ineligible when restriction excludes worker's location

---

## Failure 5: On-Site/Hybrid Treated as Remote

**Severity**: CRITICAL
**Invariant**: On-site international treated as normal remote opportunity
**Cases**: remote-hybrid-001 (hybrid London), remote-onsite-001 (on-site Manhattan)

**Observation**:
The current pipeline has no mechanism to distinguish:
- Fully remote (eligible from Pakistan)
- Hybrid with office requirement (NOT eligible if office is in London)
- On-site only (NOT eligible if site is in Manhattan)

**Root cause**:
- No field for `workplaceType` (remote/hybrid/onsite)
- No field for `officeLocation`
- Extraction does not parse "hybrid," "on-site," "days/week in office" language

**Expected fix direction**:
- Detect workplace type from text: "hybrid," "on-site," "office," "days/week"
- For hybrid/onsite, extract the office location
- Compare office location with worker location to determine eligibility

---

## Failure 6: Proof Matching Happens After Scoring

**Severity**: MEDIUM
**Invariant**: Qualification
**Cases**: won-011 (WXT/Svelte extension), won-015 (WXT/Svelte/LinkedIn), won-016 (Langflow content)

**Observation**:
The current pipeline scores leads BEFORE checking proof match quality. A lead with a perfect portfolio match (e.g., WXT + Svelte + TypeScript when bpulse has 3 similar projects) scores the same as a lead with no relevant proof.

This means the ranking doesn't reflect actual win probability — a lead with strong proof match + asking signal is much more likely to convert than one with just asking signal.

**Root cause**:
- `src/lib/score/rubric.ts`: `computeScore()` does not take proof match as input
- Proof matching (`src/lib/ai/proof-match.ts`) runs separately, after scoring
- No feedback loop from proof strength to lead priority

**Expected fix direction**:
- Include proof-match strength in scoring (or at least in ranking)
- Leads with high proof-match + asking signal should rank highest
- Leads with no proof match should rank lower even with good signal

---

## Failure 7: "Asking" Signal Weight May Be Too Low

**Severity**: MEDIUM
**Invariant**: Known-win recognition
**Cases**: won-001, won-002, won-004, won-007, won-008, won-010, won-011, won-013, won-014, won-015, won-017, won-019

**Observation**:
"Asking" (publicly asking for help) is the strongest predictor of conversion in the golden dataset — 16/20 wins had this signal. But its weight (6) is only slightly above "hiring" (6) and "pain" (5).

A public ask is STRONGER than a job posting because:
- The person is actively looking right now
- They've already decided to seek outside help
- They're receptive to outreach (they posted publicly)

**Root cause**: `src/lib/score/signals.ts`
```
{ id: 7, name: 'asking', weight: 7, ... }
```
Weight is 7, but the gap between asking and other signals is small. Given that 80% of wins had asking signal, it should be more differentiated.

**Expected fix direction**:
- Increase asking signal weight, OR
- Add bonus when asking is public (LinkedIn post) vs private (Upwork job), OR
- Add interaction effect: asking + proof_match = compound score

---

## Failure 8: Upwork Client Name Not Extracted as Contact

**Severity**: MEDIUM
**Invariant**: Supplied company/person lost
**Cases**: won-005 (Samuel Osei), won-009 (Muhammad Behsas), won-015 (Rory G), won-018 (Shohel Ahmed)

**Observation**:
For Upwork job inputs, the "client name" is the person who will hire. The current extraction schema treats this as `company` which is wrong for jobs. Upwork jobs have:
- No company (it's a freelance project)
- A client name (the person posting)
- A project title

**Root cause**:
- `src/lib/ai/extract.ts`: Extraction schema has `company` as required field
- Upwork jobs don't have companies — they have clients
- No `clientName` field in base extraction

**Expected fix direction**:
- Add `clientName` field for Upwork job extractions
- For Upwork: client name = contact person, no company needed
- For LinkedIn: company = organization, person = contact

---

## Failure 9: Evidence Specificity Check Is Too Strict

**Severity**: LOW
**Invariant**: Score changes because of representation
**Cases**: won-001 through won-020 (many)

**Observation**:
The `evidenceIsSpecific()` function requires evidence to contain a number AND be ≥12 chars. But many real winning posts have specific, actionable evidence without numbers:
- "We need a senior React developer" (no number, but specific)
- "Looking for someone to rebuild our auth layer" (no number, specific)
- "Our MVP needs RLS and tenant isolation" (no number, very specific)

**Root cause**: `src/lib/score/rubric.ts:evidenceIsSpecific()`
```javascript
function evidenceIsSpecific(evidence) {
  if (trimmed.length < 12) return false
  return /\d{1,3}(?:[,.]\d+)?/.test(trimmed) || /\b(19|20)\d{2}\b/.test(trimmed)
}
```
Only checks for numbers or 4-digit years. Doesn't recognize specificity through named technologies, named deliverables, or explicit asks.

**Expected fix direction**:
- Recognize named technologies as specific (e.g., "React," "OIDC," "Firebase")
- Recognize named deliverables as specific (e.g., "admin panel," "tenant isolation")
- Reduce dependency on numeric content for specificity scoring

---

## Failure 10: No Cross-Case State Leakage Protection

**Severity**: LOW
**Invariant**: Cross-case state leakage
**Cases**: N/A (infrastructure concern)

**Observation**:
The extraction pipeline uses a module-level cache (`extractionCache` in `src/lib/ai/extract.ts`). If the benchmark runs cases in sequence, there's a theoretical risk of cache leakage between cases with similar inputs.

**Root cause**: `src/lib/ai/extract.ts`
```javascript
const extractionCache = new Map<string, ExtractionOutput>()
```
The cache is keyed by input text, so different cases won't leak. But the `profileHints()` function and signal classification use module-level state.

**Expected fix direction**:
- Ensure each benchmark case runs in isolation
- Clear caches between cases if needed
- Document the isolation guarantee

---

## Summary

| # | Failure | Severity | Production File | Fix Direction |
|---|---------|----------|-----------------|---------------|
| 1 | WON cases score below "send" | HIGH | rubric.ts | Add proof-match factor, client-quality signals |
| 2 | No remote eligibility field | CRITICAL | extract.ts, types.ts | Add remoteEligibility to extraction |
| 3 | Company location ≠ worker eligibility | HIGH | targeting.ts | Separate market value from eligibility |
| 4 | Explicit restrictions not parsed | HIGH | extract.ts, rubric.ts | Add locationRestriction field |
| 5 | On-site/hybrid treated as remote | CRITICAL | extract.ts | Add workplaceType detection |
| 6 | Proof matching after scoring | CRITICAL | rubric.ts, proof-match.ts | Include proof strength in score |
| 7 | Asking signal underweighted | MEDIUM | signals.ts | Increase asking weight or add public-ask bonus |
| 8 | Upwork client name not extracted | MEDIUM | extract.ts | Add clientName field for Upwork |
| 9 | Evidence specificity too strict | LOW | rubric.ts | Recognize named tech/deliverables |
| 10 | Cross-case state leakage | LOW | extract.ts | Document isolation guarantee |

**Total: 10 failures discovered (3 CRITICAL, 4 HIGH, 2 MEDIUM, 1 LOW)**
