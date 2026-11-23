# Relay — Stabilization Executive Summary

**Date:** 2026-11-23
**Branch:** `feat/relay-job-intelligence-v2`
**HEAD:** `433489da187fb0d87e218a11868fa796210c976b` (verified with `git rev-parse HEAD`)
**Working tree before this pass:** clean
**Authorization:** no merge, no deploy, no production writes. Not production-activated.

---

## 1. What this pass actually did

This was a **verification and hardening pass**, not a from-scratch audit. The
repository has already been through several stabilization rounds
(`audit-reports/archive`, `docs/RELAY_*`). The work here was:

1. Confirmed the real Git HEAD and a clean tree.
2. Ran the real gates: unit suite, `tsc --noEmit`, production build.
3. Read the canonical architecture (accountability, Work Setup, assignments,
   coverage, org clock) and verified it against production data.
4. Re-checked the old (2026-09-29) P0/P1 ledger against current code and the
   live database schema.
5. Investigated 42 risk hypotheses; confirmed 15 with code or live-DB evidence.
6. Fixed 5 confirmed defects and added regression tests.
7. Recorded 10 open findings with severity, evidence and remediation.

**The 100+ finding target was not met and was not faked.** Only evidence-backed
findings are counted. See `findings-register.json`.

## 2. Gate results (this session)

| Gate | Result |
|---|---|
| `git rev-parse HEAD` | `433489da187fb0d87e218a11868fa796210c976b` |
| `git status` before edits | clean |
| Unit suite (`npm test`) | **418 files passed / 1 skipped, 5915 passed / 5 skipped** (baseline); after fixes: **420 files, 5926 tests, 1 failure fixed** — final full run recorded in §6 |
| `npx tsc --noEmit` | **exit 0, 0 errors** |
| `npm run build` | **pass**, route table emitted, no errors/warnings |
| Read-only live reconciliation | invariants hold on production `bpulse` (see `06`) |
| Production schema probe | 192 tables, 160 RLS-enabled, 494 policies, 38 `SECURITY DEFINER` |
| `npm run test:live` | **NOT RUN** — writes to production as configured (R-03) |

## 3. Confirmed defects fixed in this pass

| ID | Severity | Defect | Fix |
|---|---|---|---|
| R-01 | P1 | Cross-organization seat write (operators/backups not org-validated; RLS does not check `rep_id` membership) | `assertSeatsInOrg()` enforced in `configureCoverage` and `assignBackupResponsibility` |
| R-02 | P1 | Allocation replace could leave a lane with zero active shares | `replacePlanAllocations()` updates in place before insert; removed shares deactivated last |
| R-04 | P2 | Org deletion did not explicitly revoke sessions | `auth.signOutUser()` before `deleteUser()` |
| R-05 | P2 | Login `next` sanitizer backslash bypass | Reject `\` and whitespace |
| R-06 | P1 | GitHub PAT embedded in local remote URL | Remote URL cleaned; token never printed; **owner must rotate** |

Regression tests: `tests/work-setup-hardening.test.ts` (6 tests). Existing
`tests/operations-autopilot.test.ts` fixture updated to seed the reps the new
invariant requires.

## 4. Highest-severity open items

| ID | Severity | Item |
|---|---|---|
| R-13 | P1 | No multi-statement transaction / no optimistic concurrency on Work Setup; partial failure can leave committed drift |
| R-03 | P1 | Live-test configuration points at production (`relay_prod_final`) |
| R-06 | P1 | PAT rotation in GitHub still required (external) |
| R-09 | P2 | `personal = assigned - unseatedAllocationUnits` breaks on a solo-seat lane with an allocation |
| R-10/R-11 | P2 | Work Setup cannot clear allocations; permits allocations to unseated reps |
| R-07 | P2 | Two coexisting AI routing systems |

External blockers unchanged: **Aiven `avnadmin` rotation** and **VPS/PM2
benchmark** require console/VPS access (see `13-REMAINING-RISKS.md`).

## 5. GO / NO-GO

**GO** for the fixes in this pass to be reviewed and merged to the feature
branch. **NO-GO for production activation** until:

1. the Aiven `avnadmin` credential is rotated and the old one verified dead;
2. the VPS/PM2 benchmark is measured and accepted;
3. the owner explicitly authorizes merge/deploy;
4. R-03 is remediated so the live suite cannot write to production.

## 6. Final gate re-run

Recorded after the fixes in `12-FIXES-AND-COMMITS.md` §4.
