# Relay — Canonical Assignment Contract

**Authority:** `src/lib/operations/work-setup-write.ts` (`saveWorkSetup`),
`src/lib/profiles/assignment.ts` (`saveResponsibilityChain`),
`src/lib/coverage/actions.ts` (`configureCoverage`).

---

## 1. One writer

All assignment and target configuration goes through `saveWorkSetup`. It is the
only path that writes `profile_coverage`, `identity_assignments`,
`daily_target_plans` and `daily_plan_allocations` for the admin workflow.

```
saveWorkSetup
  ├─ validate org / identity / profile link / archived
  ├─ validate reps belong to the organization
  ├─ validate seat exclusivity
  ├─ saveResponsibilityChain  (coverage + eligibility + acknowledgements + audit)
  ├─ upsert target lanes       (one active row per identity+activity)
  └─ replace allocations       (Σ shares ≤ lane target)
```

## 2. Validation rules

| Rule | Enforcement |
|---|---|
| Identity is in the organization | query is org-scoped |
| Identity is linked to a profile | `IDENTITY_HAS_NO_PROFILE` |
| Identity is not archived | `IDENTITY_ARCHIVED` |
| Primary rep exists in the organization | `knownReps` |
| Primary is not also operator/backup | explicit check |
| No rep is both operator and backup | explicit check |
| Activity type is known | `WORK_SETUP_ACTIVITIES` |
| Target count is a positive integer | per-lane check |
| No duplicate lane in one save | `seen` set |
| Allocation sum ≤ lane target | per-lane check |

## 3. Idempotency

- `configureCoverage` is replace-and-reconcile: resubmitting the same chain
  deactivates and re-inserts the same seats, so there are no duplicates.
- Target lanes are resolved by `(identity, activity)` and updated in place.
- Allocations are deactivated then re-inserted, one active row per `(lane, rep)`.
- An unchanged save preserves acknowledgements: `configureCoverage` reports
  `unchanged` and does not re-arm them.

## 4. Reassignment

On a primary transfer the new owner becomes PRIMARY, the previous owner is not
silently stripped (a transfer opened from an arbitrary operating plan carries the
real owner forward as an operator), and the channel's plan and completion history
never move. `coverage_events` records `COVERAGE_TRANSFERRED` with the reason.

## 5. Notifications

- Assignment: `identity_assigned`, deduped per `subject:rep:identity:businessDate`.
- Target change: `target_updated`, deduped per `identity:recipient:businessDate`,
  sent to every active seat on the profile.
- A notification failure never fails a committed write.

## 6. Reads that must agree

| Surface | Reader |
|---|---|
| Admin → Work Setup | `loadWorkSetup` |
| Team → Today | `loadTeamCommandCenter` → `getOrganizationDailySummary` |
| Rep Today | `getRepDailySummary` / `loadRepDay` |
| People | `loadPeopleDirectory` → `loadTeamLive` |
| Profiles | `loadTeamProfileDirectory` / `loadProfileOperatingModel` |
| Reconciliation | `getAccountabilityLedger` |

Tests pinning this contract: `tests/targets-missing-add.test.ts`,
`tests/team-operating-contracts.test.ts`, `tests/assignment-writers.test.ts`.
