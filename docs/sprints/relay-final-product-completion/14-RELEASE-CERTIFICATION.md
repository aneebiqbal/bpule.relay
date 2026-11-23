# Release certification

## Exact state

| Item | Value |
|---|---|
| Branch | `feat/relay-job-intelligence-v2` |
| Base SHA verified at start | `9651b0adf6532df530ec2267a93c38e1b696e337` |
| Program commits | `395425c8` (P1 closure) → `16404238` (P2 closure) → `d90aa420` (artifact tracking) → docs commit(s) |
| Head | recorded in `artifacts/commit-list.json`; run `git rev-parse HEAD` for the live value |
| Working tree | clean |
| Pushed / merged / deployed | **no / no / no** |
| Production SHA | `e68110a` — **not this branch** |

## Gates

| Gate | Result |
|---|---|
| TypeScript | clean |
| ESLint | 0 errors (777 pre-existing warnings, unchanged) |
| Unit + integration, no env | **5966 passed / 19 skipped, exit 0** |
| Production build | pass |
| Browser fixture | 18/18, axe-clean |
| Route crawl | 112 routes: 81 redirect, 31 render, 0 hard failures, 0 crashes |
| CI | **not re-run here** — requires PR update; no new env-dependent tests were added |
| Migrations | unchanged; no migration added |

## Rollback

Revert `395425c8` and `16404238`. No data migration, so no data rollback. The store's unscoped
authorization branch is unchanged from baseline, so reverting cannot leave a widened permission.

## Hard acceptance scorecard

| Criterion | Status |
|---|---|
| Real MANAGER opens authorized teammate conversation | **BLOCKED** (unit-proven only) |
| Real MEMBER denied unauthorized conversation | **BLOCKED** |
| Message/intelligence scope matches queue | unit-proven |
| No cross-org leakage | **NOT RUN** |
| Work Setup save + 409 handling | unit/source-proven; not browser-proven |
| Rep allocation consistency across surfaces | aligned by shared function; not browser-proven |
| Every route classified | done (`01-SOURCE-AND-ROLE-INVENTORY.md`) |
| Every route browser-tested | **no** — unauthenticated only |
| Roles tested with real sessions | **none** |
| Primary mutations exercised | subset via fixture/unit |
| No confirmed P0 | yes |
| No release-blocking P1 | **yes — five closed** |
| RLS verified against isolated PostgreSQL | **NOT RUN** |
| Performance measured | dev loopback only |
| Staging verified | **blocked** (174/201 migrations locally) |

## Verdict

**NO-GO for production activation.** Five P1s are genuinely closed and all deterministic gates are
green, but the authenticated browser role matrix, cross-org adversarial suite and staging
verification remain blocked by infrastructure, not by code. Integrating this branch is safe;
activating production is not yet justified.

## Owner actions required

1. Provision a disposable populated database (or restore staging tables) and run the role matrix
   plus two-org denial. **Since this certification was written, a disposable local environment
   has been provisioned and the critical journeys now pass: see
   `../staging-recovery/00-STAGING-RECOVERY.md`. The remaining blockers are policy-level RLS
   adversarial testing and deployment to the real staging/VPS.**
2. Resolve the external blockers: Vercel billing; Aiven admin credential and GitHub PAT rotation.
3. Re-run CI after pushing the branch.
