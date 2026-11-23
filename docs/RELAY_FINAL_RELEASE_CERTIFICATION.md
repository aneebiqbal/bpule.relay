# Relay — Final Release Certification

**Release candidate:** `eeeda62386ee8ecbb57e3e91523eccf651b51fff`
**Branch:** `feat/relay-job-intelligence-v2`
**Scope:** unified operations — one Work Setup surface, one assignment writer,
one accounting projection.
**Authorization:** not deployed. No merge, no production activation.

---

## 1. Verification evidence

| Gate | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | pass, 0 errors |
| ESLint (changed files) | 0 errors (39 pre-existing warnings in `supabase-store.ts`) |
| Unit suite (`vitest run`) | **418 files passed / 1 skipped, 5915 tests passed / 5 skipped** |
| Production build (`pnpm build`) | pass — route table emitted |
| Live reconciliation (read-only) | populations reconcile; see §2 |
| Browser (desktop, signed in) | Work Setup, Team Today, People, Profiles, rep-day detail all agree |

## 2. Live reconciliation

Business date `2026-11-23` (Asia/Karachi), organization `bpulse`:

```
requirement = 419   assigned = 97   unallocated = 334   tracked = 431
requirementAssigned = 87   requirementUnallocated = 332
unseatedAllocationUnits = 4   completed = 0
```

Invariants: `87 + 332 = 419`; `97 + 334 = 431`; `Σ rep assigned = 97 - 4 = 93`.

Cross-surface: Work Setup `plannedRequirement 419` = Team Today `0 / 419` =
`/api/admin/accountability.requirement 419`.

## 3. What changed

- **Admin → Work Setup** (`/admin/targets`): compact account table + one drawer
  (primary → operators → backups → target plan → allocation → save). The legacy
  `TargetsManager` is deleted.
- **One writer**: `src/lib/operations/work-setup-write.ts` (`saveWorkSetup`).
- **One projection**: `src/lib/operations/work-setup.ts` (`loadWorkSetup`) over
  `getAccountabilityLedger` + `loadCanonicalProfileAssignments`.
- **Target totals unified**: rep-day detail, `/api/rep/today`, `team-live`,
  profile detail, the profile operating model and the profile directory now use
  the canonical lane-once / personal-expectation rules.
- **Security**: store `getTeamTargets` / `getManagedTeamSummary` are now
  organization-scoped.
- **Business date**: admin live feed uses `orgDate`, not the server UTC clock.

## 4. Known limits / not done

- The full admin-save → rep-acknowledges → admin-verifies journey was **not**
  executed against production (it writes live data). It is covered by unit and
  live-contract tests.
- Screenshots were not captured (the desktop tab was not visible to the agent).
- The legacy `daily_targets`, `day_closes`, `revenue_identity_contracts` and
  `profile_assignments` tables are retained for history; no surface reads them
  for targets.
- The Aiven administrator credential still requires rotation in the console
  before any release (external action).

## 5. External release checklist

1. Rotate the Aiven `avnadmin` password in the console; update
   `SERVICE_DATABASE_URL` / `DATABASE_URL` in `.env.production` and the GitHub
   secrets. Never print the value.
2. Merge `feat/relay-job-intelligence-v2` to `main` and push.
3. Deploy runs `scripts/apply-migrations.mjs` as `relay_service`. **If the release
   adds a migration, apply it first with the `avnadmin` URL** (OPS.md §4);
   `relay_service` has no DDL privilege on Aiven.
4. Confirm `GET /api/version` reports the new SHA and `/login` returns 200.
5. Re-run `node scripts/qa/reconcile-operations.mjs` and confirm the invariants.

## 6. GO / NO-GO

**GO for merge and staging verification.** NO-GO for production activation until
the Aiven credential rotation in §5.1 is confirmed by the owner.
