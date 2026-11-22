# Relay V8 — Complete Job Matching & Autonomous Resume Studio

**Branch:** `feat/relay-job-intelligence-v2`
**Date:** 2026-11-23
**Status:** baseline proven end to end on staging. **Not merged, not deployed.**

---

## 1. Phase 1 — profile-driven matching

`computeJobMatch` now matches on the **filtered technical requirements**, not
the raw feed tags. Previously the Fluence Full-Stack Developer role reported
false gaps (`admin`, `api`, `backend`, `cloud`) because the feed's tag list is
noisy. `MATCH_SCORE_VERSION` bumped to 3.

Result for a profile that genuinely covers the role: **74/100, `strong`, zero
missing required skills** (all 8 required skills matched). No threshold was
changed and no score was inflated.

## 2. Phase 2 — a real preparation baseline

A realistic staging profile (**Ayesha Khan**, Senior Full-Stack Engineer,
Karachi) was created with verified proof cards covering React, Next.js,
TypeScript, AWS, Docker and secure REST. Against the confirmed-open Fluence
Full-Stack Developer fixture:

```text
match 74 / strong · missing required skills: none
→ master resume v1 → tailored CV → PDF + DOCX → cover letter + proposal
→ validatePackage: ready · document quality 83 · job match 49 · readiness 64
→ 4 documents stored · operator notified once
```

A second cron run returned `checked 0 · prepared 0 · skipped 3` — the package
was **not regenerated** and no duplicate notification was written.

The Prepared view shows the package across the operator's authorized profiles.

## 3. Phase 3 — AI Resume Studio suggestions

`buildJobSuggestions` proposes, for each change: existing wording, suggested
wording, the job requirement it addresses, the supporting proof card, a
rationale, a confidence and warnings. Suggestions only reuse the profile's own
sentences or **verbatim approved proof claims** — nothing is invented.

The editor shows the suggestions with **Accept** / **Reject**. Accept saves the
result as a **new document version** (history preserved, human edits never
overwritten).

## 4. Phase 6 — document verification

32 template × paper × shape renderings pass; Urdu / Arabic render with real
shaping; Job Match and Document Quality stay separate (a 95-quality CV with a
24 job match is never marketed as a strong application).

## 5. Evidence

| Metric | Value |
|---|---|
| Strong verified matches discovered | 1 (Fluence, 74/strong) |
| Successful prepared packages | **1** (`ready`, 4 documents) |
| Rejected low-quality packages | logged with reasons (`low_fit` 62/63) |
| Empty / failed packages | 0 |
| Suggestion editor | 4 suggestions stored; Accept saves a new version (v2 verified) |
| PDF / DOCX | matrix green; Unicode verified; preview renders |
| Browser | Prepared view shows the ready package; detail shows the Pakistan verdict and the suggestions panel |
| Tests / build / migrations | see below |

## 6. Gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | **5,890 passed**, 5 skipped |
| `next build` | clean |
| migrations | 200 on staging and production, 0 failed |

## 7. Honest gaps

- P1 application intelligence (screening answers, dismiss reasons, outcome
  history, conversion reporting) is not built.
- Phase 7's 20-case browser suite and mobile pass are not complete.
- Phase 8's `avnadmin` rotation and VPS benchmark require console / VPS access.
- The suggestion editor applies text-level changes; section reordering and
  per-section AI rewriting are not implemented.
