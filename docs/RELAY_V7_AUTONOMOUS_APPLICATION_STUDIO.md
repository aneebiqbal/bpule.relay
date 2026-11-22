# Relay V7 — Autonomous Application Studio

**Branch:** `feat/relay-job-intelligence-v2`
**Date:** 2026-11-23
**Commits:** `0d80d752` (gates + verification), `00280b13` (live preview)
**Status:** implemented and unit-verified. **Not merged, not deployed.**

---

## 1. P0 — recommendation and preparation quality gates

A low-fit job is never auto-prepared. `prepareHighFitJobs` now applies, in
order:

1. Confirmed-open source (`verified_open`).
2. Remote role with a valid public application destination
   (`isSafeApplicationUrl`).
3. Confirmed Pakistan eligibility (`eligibility.pakistan.eligible === true`).
4. Match category is not `not_eligible` / `requires_verification`.
5. Genuine job fit ≥ `RELAY_PREPARE_MIN_FIT` (default **65**).
6. No unresolved hard-requirement gap (`missingSkills` empty).

Every decision is written to `preparation_logs` with a reason:
`low_fit`, `hard_requirement_gap`, `pakistan_unconfirmed`,
`unsafe_destination`, `eligibility_unconfirmed`.

**Staging evidence.** With the default gate, both staging profiles were skipped:
`low_fit` (match 54). Lowering the gate to 50 exposed the next gate:
`hard_requirement_gap`. No AI credits were spent and no weak package was
created. Match scores were **not** raised to satisfy the threshold.

## 2. P0 — trustworthy job verification

`verifyPendingJobs` no longer treats a generic HTTP 200 as proof. A reachable
page is `verified_open` only when the final URL is the job's own page; a
redirect to a generic careers / jobs index is recorded as
`reachable_unconfirmed`.

| Check | State |
|---|---|
| 2xx / 3xx on a job-specific page | `verified_open` |
| 2xx / 3xx on a generic careers index | `reachable_unconfirmed` |
| 404 / 410 | `closed` |
| 403 / 429 | `verification_blocked` |
| 5xx / timeout / network | `recently_seen` (reachable, unconfirmed) |

Evidence type and exact timestamp are preserved. Tests cover job pages,
generic indexes, redirects, 404, 403/429, 5xx and timeouts.

## 3. P0 — application-package completeness

`validatePackage` implements the validated state machine:

- `needs_evidence` — empty CV.
- `needs_review` — empty cover letter / proposal (AI failure), unsupported
  claims, broken PDF or DOCX, zero pages, document quality < 80, unsafe links.
- `ready` — everything passes.

**An empty cover letter is never stored as a successfully generated document.**
`prepared_jobs` stores `status` + `reason`; only `ready` notifies the operator.

## 4. P0 — Resume Studio

Added a live PDF preview (template + paper size) beside the existing edit,
compare and version-history controls. Human edits remain separate versions and
are never overwritten by generation.

## 5. Gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | **5,887 passed**, 5 skipped |
| `next build` | clean |
| migrations | 200 on staging and production, 0 failed |
| staging preparation gates | verified (skips logged, no weak packages) |

## 6. Honest gaps

- The full editor (job-specific AI suggestions with accept/reject and
  explainable changes) is not built; the deterministic tailoring + preview +
  manual edit/compare is.
- P1 is not built: screening-answer drafts, dismiss reasons, feedback on
  irrelevant recommendations, outcome history and conversion reporting.
- P0 QA: the 20-scenario browser suite and 30+ renderings are not complete
  (the 32-combination render matrix and the V6 browser pass are).
- P0 release readiness: the `avnadmin` rotation, VPS benchmark and PM2/CPU
  measurements require VPS/Aiven console access.
- Retries / cost limits / resumable processing are represented by the bounded
  cron + idempotency + logs, not a full queue.
