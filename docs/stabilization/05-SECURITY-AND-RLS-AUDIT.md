# Relay — Security and RLS Audit

**Scope:** static code + read-only production schema probe. No production writes.
**Date:** 2026-11-23

## 1. Authentication

| Control | Status | Evidence |
|---|---|---|
| Session resolution | verified | `getSession` per request, memoized (`request-scope.ts`) |
| Stale role escalation | **fixed** | `organization_roles` canonical; `reps.role` bootstrap only (`src/lib/auth/organization.ts:96-99`) |
| Signup rate limiter | **fixed** | fails closed on DB error (`src/app/api/signup/route.ts:37-39,51-53`) |
| Org deletion session revocation | **fixed this pass** | `auth.signOutUser()` before `deleteUser()` |
| Open redirect (callback) | verified | `safeNextPath` same-origin (`src/app/auth/callback/route.ts:49-58`) |
| Open redirect (login) | **fixed this pass** | backslash/whitespace rejected (`src/components/auth/login-experience.tsx:75-81`) |
| Cron gate | verified | all 8 `/api/cron/*` routes require `CRON_SECRET` |
| Service-role boundary | verified | allowlist + `can(...)` guards; no browser-reachable service client |

## 2. Authorization — confirmed defect and fix

**R-01 (P1).** `saveWorkSetup` validated only `primaryRepId` against
`reps.organization_id`. Operator/backup ids flowed unchecked into
`configureCoverageStatement`, which inserts `profile_coverage` and
`identity_assignments`. The `pc_insert` / `ia_insert` policies check the row's
`organization_id` and admin role, but **not** that `rep_id` is a member of that
organization.

Reachable via `POST /api/admin/work-setup` (parsers pass `operators`/`backups`
straight from the body) and `POST /api/admin/assignments` (no rep org check).

**Fix:** `assertSeatsInOrg()` (`src/lib/profiles/assignment.ts`) is called by
`configureCoverage()` (`src/lib/coverage/actions.ts`) and by
`assignBackupResponsibility()` before its direct eligibility upsert. All
`configureCoverage` entry points (Work Setup, admin responsibilities, team
assignments, team coverage) now funnel through the check.

**Not verified:** live exploit/remediation against two organizations (N-03).

## 3. RLS inventory

| Item | Count |
|---|---|
| Tables with RLS (production) | 160 |
| Policies | 494 |
| `SECURITY DEFINER` functions | 38 |
| Search_path pinned | yes (`20261101150000_pin_security_definer_search_path.sql`) |
| `current_org_id()` | present |
| `tailored_cvs` | present |

`refresh_few_shot_wins` now requires the caller's org and is revoked from
`authenticated` (`0042_fix_security_definer_rls.sql:147-170`,
`20261101160000_close_anon_exposure.sql:664`).

## 4. Input / API safety spot checks

| Check | Result |
|---|---|
| SQL injection | raw SQL uses `$n`; `rpc` binds by name |
| CSRF | Better Auth cookies `sameSite=lax`; state-changing routes require session |
| IDOR | spot-checked read paths scope by `organization_id` |
| Unsafe redirects | same-origin sanitizer |
| SSRF (jobs) | `isSafeApplicationUrl` enforced at ingest and UI |
| Uploads | CV/document routes org/profile-scoped (not re-examined in depth) |
| Error leakage | `safeErrorResponse` returns generic messages, logs detail |

## 5. Secrets

| Item | Status |
|---|---|
| GitHub PAT in local remote URL | **removed from `.git/config`**; owner must revoke/rotate |
| Aiven `avnadmin` | **still requires console rotation** (external) |
| `.env*` in git | ignored (`.gitignore:40`); no PAT-like strings in tracked files |
| Release tarball | `.env*` stripped by workflow |

## 6. Not run

Live RLS adversarial probes with two organizations; concurrent sessions;
permission change during an active session; direct-API authorization matrix for
every role (N-01, N-03, N-04).
