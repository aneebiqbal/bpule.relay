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

## 4. Final gate re-run

Recorded here after the fixes:

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | recorded in §5 |
| `npm test` | recorded in §5 |
| `npm run build` | recorded in §5 |

(See the bottom of this file — updated after the final run.)

## 5. Commit

A single scoped local commit was created on the feature branch. **Not pushed, not
merged, not deployed.** Exact SHA recorded below after commit.
