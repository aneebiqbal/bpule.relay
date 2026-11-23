# Relay — Final Release Report (Stabilization Closure)

**Date:** 2026-11-23
**Branch:** `feat/relay-job-intelligence-v2`
**Base HEAD:** `60ab5204e7733cacdb52c36d6b25a9bd0e57ff7c`
**Authorization:** not deployed. No merge, no production activation.

## 1. Exact Git SHA

**Release candidate (code + closure):** `87ccbeaa`
**Branch tip (docs artifacts):** `919b8944`
**Base of this closure pass:** `60ab5204e7733cacdb52c36d6b25a9bd0e57ff7c`

## 2. Commits integrated

```
87ccbeaa feat(stabilization): atomic Work Setup, fail-closed test isolation, allocation rule fixes
60ab5204 docs(stabilization): reconciliation/schema artifacts and cleanup+deploy runbook
fa55a728 docs(stabilization): record final gate results
2dbf4543 fix(security,integrity): org-validate Work Setup seats and harden allocations
```

Local only. Not pushed, not merged, not deployed.

## 3. Findings

| Metric | Count |
|---|---|
| Initial confirmed findings | 15 |
| Fixed / closed this program | 13 |
| Local fix, external rotation pending | 1 (R-06 PAT) |
| Open / accepted | 1 (R-07 dual AI router) |
| Not run (external blockers) | 8 |

Per-finding root cause, fix, test, verification, commit and residual risk:
`16-OPEN-FINDINGS-CLOSURE.md` and `findings-register.json`.

## 4. Evidence for each high-priority fix

| Finding | Evidence |
|---|---|
| R-01 cross-org seat write | `tests/work-setup-hardening.test.ts`; code `assertSeatsInOrg` |
| R-02/R-13 transaction + atomicity | `tests/work-setup-transaction.test.ts` — failure injected before coverage, after eligibility, after target upsert, during allocation replace, during audit insert; every case restored the full prior state |
| R-03 live-test isolation | `tests/db-test-isolation.test.ts` (13) + CLI/config rejection probes (`18-LIVE-TEST-ISOLATION.md` §4) |
| R-04 session revocation | `tests/security-regressions.test.ts` (mock asserts signOutUser before deleteUser) |
| R-05 redirect normalization | `tests/security-regressions.test.ts` (7 cases incl. backslash/protocol-relative) |
| R-09 accounting invariant | `tests/work-setup-accounting-rules.test.ts` (solo lane allocation) |
| R-10 clear allocations | same file (omitted / empty / supplied) |
| R-11 seat-enforced allocations | same file (backup-only rep rejected) |

## 5. Transaction rollback results

`17-TRANSACTION-INTEGRITY.md` §3: five injected failures, all rolled back;
stale-revision conflict returns `409` with current values and zero writes.

## 6. Test-database isolation proof

`18-LIVE-TEST-ISOLATION.md` §4: production URL rejected, swapped service URL
rejected, two-variable injection rejected, marker-only staging accepted, missing
config fails closed. `npm run test:live` now refuses to start.

## 7. Browser matrix coverage

**Not executed.** `19-ROLE-BROWSER-MATRIX.md` records the plan, the required
roles/journeys and prior evidence. Blocker: no staging credentials/environment.

## 8. RLS results

Production schema probe: 160 RLS tables / 494 policies / 38 SECURITY DEFINER
(search_path pinned); `current_org_id()` and `tailored_cvs` present. Live
two-organization adversarial probes were **not run** (would require writes).

## 9. Accounting reconciliation

Read-only, production `bpulse`, business date 2026-11-23:

```
tracked 431 = assigned 127 + unallocated 304
requirement 419 = requirementAssigned 117 + requirementUnallocated 302
personal 123 = assigned 127 - unseatedAllocationUnits 4
```

Artifacts: `live-reconciliation-2026-11-23.json`,
`production-schema-probe-2026-11-23.json`. No historical values hardcoded in tests.

## 10. Performance

`20-PERFORMANCE-CERTIFICATION.md`: no new HTTP/VPS benchmark; DB-layer
reconciliation measured; prior HTTP numbers carried. Worker benchmark remains an
external blocker.

## 11. Security credential status

| Credential | Status |
|---|---|
| GitHub PAT in git remote | removed from `.git/config`; **owner must revoke/rotate** |
| Aiven `avnadmin` | **still requires console rotation** (external) |
| Secrets in tracked files | none (`git grep` clean) |
| Release tarball env stripping | unchanged workflow behavior |

> Disclosure: during this pass one diagnostic command printed the raw remote
> URL including the token. It was not written to any file or commit. Rotation is
> still required.

## 12. Migration readiness

201 migrations; production reports 192 tables. No destructive migration added.
`scripts/apply-migrations.mjs` idempotent (prior `applied=0 skipped=200 failed=0`).
New columns/indexes: none required for these fixes.

## 13. Deployment and rollback commands

`15-CLEANUP-AND-DEPLOYMENT.md` §§2–4. Production app on `postgres` uses the
atomic Work Setup path.

## 14. Gate results (this pass)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm test` | **423 files passed / 1 skipped (424); 5954 passed / 5 skipped (5959)** |
| `npm run build` | pass, route table emitted, no errors/warnings |
| `npx eslint` (changed files) | 0 errors (pre-existing `any` warnings only) |
| `npm run test:live` | **refuses to start** without `RELAY_TEST_DATABASE=1`; production URL rejected |

## 15. GO / NO-GO

**GO** for the closure changes to be reviewed and merged to staging.

**NO-GO for production** until:

1. Aiven `avnadmin` rotated and old credential verified dead (external).
2. GitHub PAT revoked/rotated (external).
3. VPS/PM2 worker benchmark captured and accepted (external).
4. Staging role×route browser matrix executed (external).
5. Owner explicitly authorizes merge/deploy.

All release-blocking code defects within reach are fixed with regression
evidence. Remaining items are external certifications, not code gaps.
