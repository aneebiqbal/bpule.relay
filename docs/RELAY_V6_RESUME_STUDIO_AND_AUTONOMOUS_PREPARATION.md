# Relay V6 — Resume Studio & Autonomous Preparation

**Branch:** `feat/relay-job-intelligence-v2`
**Date:** 2026-11-23
**Status:** implemented and unit-verified; staging browser pass pending for the
new Prepared view. **Not merged, not deployed.**

---

## 1. Canonical resume evidence (Phase 1)

`buildResumeData` is the master resume. Changes:

- **No misattribution.** Employment bullets come only from `client_work` proof
  that matches the role. Project / personal achievements are never attached to
  an employer; they render under a separate **Selected achievements** heading.
- **Source references.** Every employment bullet carries a `bulletSources`
  proof-card id; `GeneratedDocument.evidenceUsed` lists the proof used.
- **Conflict detection.** Overlapping employment date ranges produce a warning
  (`Overlapping employment dates: A and B.`).
- **Versioned master resume.** `master_resumes` table
  (`20261122120000_master_resume_preparation.sql`) stores one version per
  evidence hash; `getOrCreateMasterResume` is idempotent and never rewrites an
  unchanged version. Human corrections create a new version.

Tests: `never attaches unrelated claims to an employer`, `attaches a matching
client-work claim to the role with a source id`, `flags overlapping employment
dates`, `never leaks another profile evidence`.

## 2. Document quality 83 → 95 (Phase 2)

Diagnosis of the staging fixture (was 83):

| Dimension | Before | Cause | Fix |
|---|---:|---|---|
| Readability | 11/20 | `Rebuilt` not matched by the action-verb list | expanded verb list (`rebuilt`, `developed`, `maintained`, …) |
| Contact | 7/15 | weighting demanded email + phone, which Relay profiles do not store | location + portfolio link are the primary remote signals (6 + 4); email / phone are bonuses (3 + 2) |
| Extraction | 20/20 | — | — |

Result on the staging profile: **Document quality 95/100**. Job match stays an
honest **24/100** — the staging profile genuinely lacks most required skills, and
the mission requires a weak match to stay weak.

## 3. Unicode PDF (Phase 3)

Replaced the Latin-1 base-14 renderer with **PDFKit + an embedded subset Unicode
font** (`assets/fonts/RelaySans.ttf`, 178 KB, subsetted from Arial Unicode with
`pyftsubset`; Latin + Arabic + Urdu + punctuation).

Verified by rendering and inspecting a real page:

```
PDF: Ayesha Khan — ایجنس
     مهندس برمجيات
     Skills: React, پایتون, Français
```

Arabic and Urdu render with **connected glyphs and correct RTL**; `Français`
keeps its cedilla. Extraction returns the text. The old `?` degradation is gone.

`renderResumePdf` is now async (PDFKit streams). `countPdfPages`,
`extractPdfText`, link annotations, A4 / US Letter and all four templates still
pass. `pdfkit` / `fontkit` are in `serverExternalPackages` because fontkit's ESM
build imports an `@swc/helpers` export Turbopack cannot resolve.

Test: `embeds a Unicode font so Urdu and Arabic render with real glyphs`.

## 4. Verification states (Phase 5)

`verifyPendingJobs` now distinguishes four states and records the exact time:

| Check | State | Evidence |
|---|---|---|
| 2xx / 3xx | `verified_open` (confirmed open) | `verified_open` |
| 404 / 410 | `closed` (confirmed closed) | `closed` |
| 403 / 429 | `verification_blocked` | `verification_blocked` |
| 5xx / timeout / network | `recently_seen` (reachable, unconfirmed) | `check_failed` |

A failed check never closes a job.

## 5. Automatic preparation (Phase 6)

`prepared_jobs` table + `prepareHighFitJobs` + `GET /api/cron/job-preparation`
+ `deploy/job-preparation.{service,timer}`.

For each authorized profile, the strongest verified, eligible, high-fit job is
selected; the master resume is built, tailored, rendered, assessed, and the
package (CV, cover letter, proposal, LinkedIn note) is stored. Idempotency key =
`job + profile + content_hash + template + paper`, so unchanged inputs are never
regenerated. Human edits are never overwritten. The operator is notified once.
**Nothing is ever submitted.**

Staging result: `checked 1 · prepared 1` for the Fluence Full-Stack Developer
role (document quality 95, job match 24).

## 6. Jobs daily workflow (Phase 7)

New **Prepared** view (`/jobs?view=prepared`, nav group Pipeline) lists prepared
packages with match, document quality, readiness, status and the exact time.
Each card deep-links to the job with the selected profile.

## 7. Gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | 5,879 passed, 5 skipped |
| `next build` | pass (no warnings) |
| migrations | 199 on staging and production, 0 failed |
| render matrix | 32 template × paper × shape combinations green |
| Unicode render | Urdu / Arabic visually verified |

## 8. Honest gaps

- The Prepared view is not yet browser-tested (the browser tool was unavailable
  for part of this run).
- Phase 8's 20-case browser suite and Phase 9's VPS/security certification are
  not complete.
- Screening-answer drafts, dismiss reasons and outcome learning are not built.
- Preparation AI documents require provider credentials in the cron environment
  (they are present in `.env.production`; the local `tsx` run had none, so the
  stored package text was empty there).
