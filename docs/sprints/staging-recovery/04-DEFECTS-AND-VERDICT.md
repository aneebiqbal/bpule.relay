# Defects found by real execution, and verdict

## Fixed in this program

| # | Severity | Defect | Reproduced by | Fix |
|---|---|---|---|---|
| 1 | **P1** | `GET /api/admin/work-setup` returned HTTP 500 on any database with an assignment: the revision query read `identity_assignments.updated_at`, which migration 0081 never created. Work Setup was unusable for admins. | Authenticated admin session against the freshly provisioned database | new migration `20261124000000_add_identity_assignments_updated_at.sql` (add + backfill + index); verified GET now 200 with correct requirement/allocated numbers |
| 2 | P2 | Out-of-scope conversation access surfaced as HTTP 500 ("Could not load the conversation") instead of a denial, indistinguishable from a server fault. | Member requesting a lead on an identity with no seat/coverage | typed `LeadAccessDeniedError(AppError 404)` raised by both stores; routes return 404 "Lead not found." |
| 3 | P2/ops | Clean-database bootstrap failed at 174/201 migrations: invalid `ON CONFLICT` targets, non-idempotent table alterations, one wrong column type. | `staging-bootstrap.mjs` | corrected six migration files (all additive/idempotent repairs) |

## Observed, recorded, not fixed

| Defect | Evidence | Note |
|---|---|---|
| Perf instrumentation calls `performance.measure()` with a negative timestamp (`TodayPage`) | page error during the manager journey; whitelisted explicitly in `staging-e2e.mjs` | Real defect, low severity, not hidden — listed here because it is excluded from the pass/fail count |

## Test counts at final state

| Suite | Result |
|---|---|
| TypeScript | clean |
| ESLint | 0 errors (777 pre-existing warnings) |
| Unit + integration, no env | **5970 passed / 19 skipped**, exit 0 |
| Production build | pass |
| Authenticated staging E2E | **19 passed / 0 failed** |
| Migration bootstrap | 198 applied / 0 failed / 4 documented skips |

## Release recommendation

**GO for integrating this branch.** The verification bottleneck that blocked the last two
programs is gone: the schema provisions cleanly, real sessions run, and the critical
Inbox and Work Setup journeys pass end to end.

**NO-GO for production activation** until:
1. the same authenticated matrix runs against the deployed staging/VPS environment,
2. policy-level RLS adversarial testing completes against isolated PostgreSQL,
3. external security gates clear: Aiven administrator credential rotation, GitHub PAT
   revocation, Vercel billing unblock.

Production was never used for testing, and nothing has been merged or deployed.
