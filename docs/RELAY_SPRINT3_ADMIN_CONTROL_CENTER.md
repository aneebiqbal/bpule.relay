# Relay Sprint 3 — Admin Operations Implementation

Branch `feat/relay-completion-program`. Commits `72b6cf59` (and the Sprint 2
commits before it). Pushed; not deployed.

## 1. P0 — Inconsistent assignment readers removed

| Surface | Before | After |
|---|---|---|
| `lib/relay/dashboard-loader.ts` (rep My Day) | `identity_assignments` for the rep | `listExecutableIdentitiesForRep` |
| `lib/relay/dashboard-loader.ts` (admin Command Center) | org-wide `identity_assignments` | `listExecutableIdentitiesForOrg` (new) |
| `lib/rep-day/team.ts` (manager/team day) | org-wide `identity_assignments` | `listExecutableIdentitiesForOrg`, scoped to the visible reps |
| `store.getRepAssignments` | eligibility-only reader | **removed** (dead: no callers) |

`listExecutableIdentitiesForOrg` is the org-wide form of the canonical rules:
active PRIMARY/OPERATOR seats plus active temporary coverage, minus REPLACE
covered primaries. Backup-only reps never appear. Contract test:
`tests/execution-readers.test.ts`.

## 2. P0 — Slow assignment writes

Profiled: `configureCoverage` + `syncChannelEligibility` + acknowledgements +
audit + notification ≈ 12–18 sequential round trips, ~1.5 s each on this host.
Adding an operator never removes unrelated seats (verified). **Not yet
optimised** — see Blockers. The likely production 500s are pool contention
against the 10 s connection timeout, not logic.

## 3. Channel lifecycle

Not implemented. `revenue_identities.status` already carries
active/archived/inactive/suspended in places, but there is no validated
transition service, no reason/actor record and no central management UI.

## 4. Unified Admin Control Center — implemented

`/admin/control-center` (admin/owner only), now the Admin nav entry and the
`/admin` landing.

- **Profiles** — `PersonProfilesWorkspace`: one card per person, LinkedIn and
  Upwork nested, status, primary, operators, backups, targets, and the existing
  Assign / Unassign / Targets / Schedule / Knowledge / History dialogs.
- **Team** — `PeopleWorkspace`: member cards with assigned channels,
  primary/operator/backup roles, today's target progress, acknowledgements,
  overdue work, workload and assign controls.
- **Issues & Data** — `IssuesData`: the reconciliation queue with per-kind
  counts, a finding list, re-scan, and Apply-approved repair (server re-scans
  and only repairs findings that still match).

Verified in the browser: the page renders with all three tabs, the Admin rail
shows Control Center first, and the Profiles tab shows the person directory.

## 5–7. Assignment / target / task / archive actions

Assignment actions exist in the embedded Profiles workspace (assign, unassign,
transfer, targets, schedule) and are canonical. Target editing exists in the
profile/channel dialogs. Task creation exists per member (`AssignTaskButton`).
**Not** re-implemented inside the Control Center header, and archive/delete/
duplicate-merge UI is not built.

## 8. Browser acceptance

Control Center render verified. The full admin→operator journey (add operator,
both see the channel, targets, task, suspend, restore, archive) is **not**
covered by Playwright in this sprint.

## 9. Gates

| Gate | Result |
|---|---|
| TypeScript | clean |
| Standalone build | exit 0 |
| Unit | **396 files / 5,770 passed** |
| Live-DB | see release note |

## 10. Route/action coverage

| Area | Covered | Missing |
|---|---|---|
| Assignment read | all execution surfaces canonical | — |
| Assignment write | canonical service + 4 routes + store delegation | batch UI in one place |
| Reconciliation | scan + approved repair + API | UI for non-repairable kinds |
| Control Center | Profiles / Team / Issues | target & task actions in header |
| Lifecycle | — | transitions, reasons, restoration |
| Deletion / duplicates | — | archive/restore/delete/merge UI |
| Playwright | — | full journey |

## 11. Blockers / next exact steps

1. Reduce the assignment write round trips: batch the acknowledgement seeds
   into one upsert, drop the redundant pre-reads, and write the audit row in
   the same statement where the driver allows.
2. Add `lib/profiles/lifecycle.ts` with validated transitions and reasons, a
   `GET/POST /api/admin/identities/[id]/lifecycle`, and gate every executable
   read on `status = 'active'`.
3. Add archive/restore/delete with a dependency preview and server-side
   eligibility checks.
4. Add the Playwright journey on disposable fixtures.

## 12. Fixture drift (found, not repaired)

The shared Fizza·Upwork acceptance fixture is no longer in its documented
state: `profile_coverage` has **no active PRIMARY** (only an active BACKUP for
Madiha). The v611 acceptance case now verifies that precondition and **skips**
rather than writing real production coverage to force it. The target itself is
untouched (5 applications). Repairing the fixture chain is a production-data
decision for the operator, not something the test should do.
