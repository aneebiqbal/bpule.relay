# Relay — Production Release Certification

**Date:** 2026-11-23
**Branch:** `feat/relay-job-intelligence-v2`
**Base SHA:** `433489da187fb0d87e218a11868fa796210c976b`
**Deployed production SHA:** `a04afca02a20521e025fd6e0a3fcabba36685c99` (from
`feat/relay-completion-program`, per `RELAY_RELEASE_GATE_FINAL.md`). **This
feature branch is NOT deployed.**

## 1. Functional

| Criterion | Status |
|---|---|
| Confirmed P0 resolved | No confirmed P0 remains. Historical P0-04/05/06/08 are **unverified**, not confirmed fixed. |
| Release-blocking P1 resolved | R-01 fixed; R-02 partially; **R-13 open**; R-03/R-06 open |
| Critical journeys | Prior browser pass: login, jobs, Work Setup, midnight rollover ✅; full role matrix ❌ |
| Accounting reconciles | ✅ live production, 2026-11-23 (see `06`) |
| Assignment lifecycle | Unit + prior browser ✅; concurrent live ❌ |
| Rep/Admin agreement | ✅ canonical projection |
| Job preparation | Prior passes ✅; live provider ❌ |

## 2. Security

| Criterion | Status |
|---|---|
| Authorization matrix | Static matrix complete; runtime per-role matrix ❌ |
| Cross-organization isolation | RLS 160 tables / 494 policies; R-01 fixed; live 2-org probe ❌ |
| RLS tests | Prior live suite 144 passed (not run here) |
| Secrets | PAT removed locally, **rotation pending**; `avnadmin` **rotation pending** |
| High-severity unmitigated | R-03 (production-targeted live tests) |

## 3. Data

| Criterion | Status |
|---|---|
| Migrations validated | 200 applied, idempotent re-run (prior pass) |
| Unexpected production modifications | None by this pass |
| Historical records | Preserved |
| Idempotency/rollback | Notification/prepare/email dedupe verified statically |
| Accounting invariants | Hold on live data |

## 4. Experience

| Criterion | Status |
|---|---|
| Navigation | Prior pass ✅ |
| Primary forms | Prior pass ✅ |
| Dead critical buttons | None found |
| Desktop/mobile | Prior pass ✅ (mobile one case) |
| Accessibility | Prior passes; not re-run |

## 5. Performance

| Criterion | Status |
|---|---|
| No serious regressions | Not measured this session |
| Normal requests during workers | Not measured |
| Query counts bounded | Request-scope memoization verified in prior pass |
| Resource consumption | Not measured |

## 6. Delivery

| Criterion | Status |
|---|---|
| Clean Git state | ✅ before edits; changes uncommitted at certification time → committed locally, not pushed |
| Exact commit SHA | See `12-FIXES-AND-COMMITS.md` |
| Reproducible build | ✅ `npm run build` |
| Staging verification | Prior pass ✅ |
| Deployment artifact | Not built/verified this pass |
| Rollback instructions | `OPS.md §7` |

## 7. GO / NO-GO

**GO** — for the five fixes in this pass to be reviewed and merged to the feature
branch, then deployed to staging for the browser matrix.

**NO-GO** — for production activation until:

1. Aiven `avnadmin` rotated and old credential verified dead (external).
2. VPS/PM2 benchmark measured and accepted (external).
3. R-03 remediated so the live suite cannot write to production.
4. R-13 transaction/concurrency gap accepted or fixed.
5. Owner authorizes merge and deploy.

## 8. Exact blockers, stated plainly

- Aiven console access required.
- VPS/PM2 access required.
- Staging environment/credentials required for the role browser matrix.
- GitHub token revocation required.
- No production writes were performed; no test is reported as passing that was
  not run.
