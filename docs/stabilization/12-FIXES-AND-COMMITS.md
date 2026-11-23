# Relay — Fixes and Commits

**Branch:** `feat/relay-job-intelligence-v2`
**Base HEAD:** `433489da187fb0d87e218a11868fa796210c976b`

## 1. Files changed

| File | Change |
|---|---|
| `src/lib/profiles/assignment.ts` | Added `assertSeatsInOrg()`; enforced in `assignBackupResponsibility()` |
| `src/lib/coverage/actions.ts` | `configureCoverage()` now validates every named seat against the organization |
| `src/lib/operations/work-setup-write.ts` | Extracted `replacePlanAllocations()` — update-in-place, insert-new, deactivate-removed |
| `src/app/api/organization/delete/route.ts` | Revoke sessions (`signOutUser`) before `deleteUser` |
| `src/components/auth/login-experience.tsx` | `sanitizeNextPath` rejects backslash/whitespace |
| `tests/work-setup-hardening.test.ts` | **new** — 6 regression tests |
| `tests/operations-autopilot.test.ts` | Fixture now seeds `reps` for the new invariant |
| `.git/config` | Remote URL no longer embeds the GitHub PAT |

## 2. Behavior changes

1. A Work Setup or assignment request naming a rep outside the caller's
   organization is now rejected (`400`/`ok:false`) instead of writing a foreign
   seat.
2. A failure while replacing allocations can no longer leave a lane with zero
   active shares; existing shares stay active.
3. Deleting an organization explicitly revokes each member's sessions.
4. `/login?next=/\evil.example` now falls back to `/dashboard`.

## 3. Tests added

`tests/work-setup-hardening.test.ts`:
- `assertSeatsInOrg` accepts in-org rep,
- rejects foreign rep,
- accepts empty list,
- `replacePlanAllocations` updates + inserts,
- deactivates removed shares,
- preserves existing shares when an insert fails.

## 4. Final gate re-run (after the fixes)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **exit 0, 0 errors** |
| `npm test` | **419 files passed / 1 skipped (420); 5921 passed / 5 skipped (5926)** |
| `npm run build` | **pass**, route table emitted, no errors/warnings |
| `npx eslint` (changed files) | **0 errors** (test file ignored by config) |
| `npm run test:live` | **not run** — writes to production (R-03) |

Baseline before fixes: 418 files / 5915 tests passed. Delta: +1 file, +6 tests,
0 failures.

## 5. Commit

**SHA:** `2dbf4543` (full: recorded by `git rev-parse HEAD`)
**Branch:** `feat/relay-job-intelligence-v2`
**Pushed:** no. **Merged:** no. **Deployed:** no.

```
2dbf4543 fix(security,integrity): org-validate Work Setup seats and harden allocations
```

Working tree after commit: clean.

The final-gate table above was recorded in a follow-up docs commit; the release
candidate for the code and stabilization docs is `2dbf4543`. See
`git log --oneline -2`.
