# Relay V5 — ATS Score Specification

**Module:** `src/lib/job-discovery/ats-score.ts`
**Status:** implemented and unit-verified.

---

## 1. Two independent scores

Relay never presents a single "ATS score" as if it were an employer ranking.

| Score | Question it answers | Range |
|---|---|---|
| **Document Quality** | Is this resume readable, complete and extractable? | 0–100 |
| **Job Match** | Is this candidate genuinely aligned with **this** posting? | 0–100 |
| **ATS readiness** | 0.45 × Document Quality + 0.55 × Job Match | 0–100 |

The readiness blend is an internal prioritisation aid, not a hiring probability.

## 2. Document Quality dimensions (100)

| Dimension | Max | Signal |
|---|---:|---|
| Identity & completeness | 25 | name, title, summary, skills, experience |
| Chronology & accuracy | 20 | every role carries a dated period |
| Readability & action wording | 20 | bullets start with action verbs, no banned buzzwords |
| Contact & links | 15 | email / phone / portfolio links / location |
| PDF extraction & format | 20 | text-layer coverage, page count, no overflow |

## 3. Job Match dimensions (100)

| Dimension | Max | Signal |
|---|---:|---|
| Required skill coverage | 30 | filtered, aliased skill match |
| Relevant experience | 20 | responsibilities supported by resume evidence |
| Preferred qualifications | 15 | preferred signals present |
| Evidence quality | 15 | evidenced roles + projects with outcomes |
| Domain relevance | 10 | title / company domain |
| Seniority fit | 10 | stated seniority |

## 4. Targets

- **95+ Document Quality** for a well-formed, complete source profile.
- **90+ ATS readiness** for a genuinely suitable application where the evidence
  supports it.
- **No artificial minimum** on the genuine Job Match score.

Scores are additive and every dimension carries a human-readable note. Nothing
is inflated: a missing required skill reduces the score and is listed as an
honest gap.

## 5. Anti-inflation rules

- Missing required skills are reported, never omitted.
- No keyword stuffing: skills are matched on a filtered technical vocabulary
  with aliases (`Rails` ↔ `Ruby on Rails`, `K8s` ↔ `Kubernetes`).
- Extraction coverage below 90% lowers Document Quality.
- A broken PDF (no text layer) lowers Document Quality.
- Failed / lower-scoring drafts are preserved for comparison.

## 6. Tests

`tests/job-ats-score.test.ts` asserts: 95+ for a complete truthful document,
alias matching, honest gap reporting, extraction penalties, and the separate
document / match / readiness values.
