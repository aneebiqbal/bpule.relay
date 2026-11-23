# Relay — Open Findings Closure

**Pass:** stabilization closure · **Base HEAD:** `60ab5204` · **Date:** 2026-11-23
Authoritative register: `findings-register.json`.

## 1. Per-finding closure record

| ID | Original issue | Root cause | Fix | Regression test | Status |
|---|---|---|---|---|---|
| R-01 | Cross-org seat write | operator/backup ids not org-validated; `pc_insert`/`ia_insert` check row org, not `rep_id` membership | `assertSeatsInOrg()` in `configureCoverage` + `assignBackupResponsibility` | `tests/work-setup-hardening.test.ts` | **closed** |
| R-02 | Allocation replace could zero a lane | deactivate-all-then-insert under `dpa_active_uniq` | `replacePlanAllocations()` update-in-place → insert → deactivate removed; now inside the transaction | `work-setup-hardening`, `work-setup-transaction` | **closed** |
| R-03 | Live tests wrote to production | `.env.local` pointed at `relay_prod_final`; no guard | fail-closed `src/lib/db/test-isolation.ts`, wired into live/smoke configs + global setup + runner + QA scripts | `tests/db-test-isolation.test.ts` (13 tests) | **closed** |
| R-04 | Org delete did not revoke sessions | relied on provider cascade | `auth.signOutUser()` before `deleteUser()` | `tests/security-regressions.test.ts` | **closed** |
| R-05 | Login `next` backslash redirect | sanitizer only rejected `//` | shared `sanitizeNextPath` rejects `\` and whitespace | `tests/security-regressions.test.ts` | **closed** |
| R-06 | GitHub PAT in git remote | plaintext credential in `.git/config` | remote URL cleaned locally; token never printed | `git config --get remote.origin.url` contains no `ghp_` | **local fix; rotation pending** |
| R-07 | Two AI routers | legacy `src/lib/ai/routing.ts` still imported by 4 modules | **not migrated** — behavioural equivalence needs live provider comparisons | none | **open (accepted)** |
| R-08 | UTC dates in adjacent surfaces | `new Date().toISOString().slice(0,10)` | replaced with `orgDate(currentInstant(), policy.timezone)` in admin targets routes and canonical loader | typecheck + unit suite | **closed** |
| R-09 | `personal = assigned - unseated` broke on solo-seat allocation | org `assigned` used full lane target for solo lanes | `assigned` now sums `lanePersonalTarget` over seats + unseated allocations | `tests/work-setup-accounting-rules.test.ts` | **closed** |
| R-10 | Work Setup could not clear allocations | empty list produced an empty loop | explicit empty list clears the affected lanes (targets or active plan lanes) | `tests/work-setup-accounting-rules.test.ts` | **closed** |
| R-11 | Unseated allocations allowed | only org membership checked | allocation rep must hold an active PRIMARY/OPERATOR seat; BACKUP rejected | `tests/work-setup-accounting-rules.test.ts` | **closed** |
| R-12 | Dead `_userId` params | unused parameters implied per-user auth | removed; callers updated | typecheck + unit suite | **closed** |
| R-13 | No transaction / no optimistic concurrency | `DbClient` had no transaction; each query its own | `DbClient.transaction` on Neon + Postgres; `saveWorkSetup` atomic; compare-and-set revision | `tests/work-setup-transaction.test.ts` (7) | **closed** |
| R-14 | Second coverage writer | `backfillProfileCoverage` bypassed canonical writes | removed (no callers); canonical `configureCoverage` remains the only runtime writer | typecheck + unit suite | **closed** |
| R-15 | Requirement invariant doc mismatch | wording mixed tracked vs targetable | register/docs distinguish `tracked`, `requirement`, `requirementAssigned`, `requirementUnallocated` | this document | **closed** |

## 2. Counts

| Metric | Count |
|---|---|
| Confirmed findings | 15 |
| Closed | 13 |
| Local fix, external rotation pending | 1 (R-06) |
| Open / accepted | 1 (R-07) |

## 3. Remaining risk

- **R-07** is accepted, not fixed. Provider selection can diverge between the two
  routers until the legacy one is retired; that requires live provider
  comparison, which was not performed.
- **R-06 / Aiven `avnadmin`** remain external blockers requiring console access.
- The transaction fallback for the Supabase (PostgREST) provider is sequential;
  production runs on `postgres`, so the atomic path is active there.
