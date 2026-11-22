# Relay V5 — End-to-End Acceptance

**Date:** 2026-11-20
**Commit:** `beec9093`
**Environment:** `relay_staging` (Aiven), real Chromium, `next start` build.

---

## 1. Browser journey

Script: `scripts/qa/job-intelligence-v5-acceptance.mjs`.
Screenshots: `qa-artifacts/staging-v5/`.

```text
login ok: /dashboard
shortlist cards: 13
verified recommended present: true
no mojibake: true
job detail: Software Engineer - Auth
document quality shown: true
job match shown: true
checklist present: true
pdf: 200 application/pdf 2053 bytes
pdf A4 media box: true
pdf has link annotation: true
zip: 200 9204 bytes
zip magic: true
```

Observed in the UI:

- The shortlist shows verified recommended roles with the `Verified open` badge
  and no double-encoded text.
- The job detail shows `Pakistan: eligible (worldwide, likely)`.
- The ATS panel shows three separate numbers: **Document quality 76/100**,
  **Job match 35/100**, **ATS readiness 53/100**.
- The six-step pre-submission checklist is present; the submit button still
  requires explicit confirmation.

## 2. Document render matrix

`scripts/qa/resume-render-matrix.ts` — 32 combinations, all green. See
`RELAY_V5_PDF_VISUAL_QA.md`.

## 3. Verified job pipeline

Production `relay_prod_final` after the verification sweep and reindex:

```text
recommended 5   eligible_low 8   included 61
location_restricted 415   not_remote 746   stale_unverified 78
duplicate 130   eligibility_unknown 48
```

See `RELAY_V5_JOB_QUALITY_REPORT.md`.

## 4. Test gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint` (changed paths) | 0 errors |
| `vitest run` | **5,875 passed**, 5 skipped |
| `next build` | pass |
| migrations | 198 on staging and production, 0 failed |

The single failure in the full run was
`tests/intelligence-v2-benchmark.test.ts` timing out at 180 s under suite load.
It passes in isolation (21/21, 181 s) and is a real-AI provider benchmark
unrelated to V5.

## 5. Not covered (honest scope)

- 20 varied job/profile end-to-end cases and 30 CV renderings: the render
  matrix covers 32 template/paper/shape combinations; the per-profile
  job-journey cases are represented by unit tests, not a 20-case browser suite.
- Account switching / unauthorized identity access: covered by existing RLS
  contract tests, not re-run in the browser here.
- Mobile layout for the new template / paper controls: not re-verified.
