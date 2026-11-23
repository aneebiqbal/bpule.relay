# Relay — Unified Operations Architecture

**Status:** implemented on `feat/relay-job-intelligence-v2`.
**Authority:** this document, `src/lib/execution/accountability.ts`, `src/lib/operations/work-setup.ts`, `src/lib/operations/work-setup-write.ts`.

---

## 1. Problem

Relay exposed the same business facts through several independent models:

- `identity_assignments` (eligibility) vs `profile_coverage` (seats) vs
  `coverage_assignments` (temporary cover) vs `profile_assignments` (legacy).
- `daily_target_plans` (channel lanes) vs `daily_targets` (legacy per-rep) vs
  `revenue_identity_contracts` / `contract_allocations` (legacy System B).
- `daily_accountability.completed_count` (truth) vs `day_closes` snapshots
  (legacy) vs `action_events` counts (a different unit).

Each management screen re-derived its own total from a different subset. The
result was the owner's 417 / 405 / 81 / 156 disagreement: four numbers that were
all "correct" for four different populations.

## 2. The one model

| Concept | Authority | Written by |
|---|---|---|
| Person | `reps` (+ `organization_roles`, `team_memberships`) | People & Roles |
| Account / channel | `revenue_identities` (one row per real identity) | Profile intelligence |
| Profile (person) | `profiles` (canonical `person_id` groups channels) | Profile intelligence |
| Responsibility | `profile_coverage` active `PRIMARY` / `OPERATOR` / `BACKUP` | `saveResponsibilityChain` → `configureCoverage` |
| Eligibility | `identity_assignments` | same write, derived from seats |
| Daily requirement | `daily_target_plans` (one active lane per identity+activity, effective-dated, `targetable`) | `saveWorkSetup` |
| Per-operator share | `daily_plan_allocations` (optional; sum ≤ lane target) | `saveWorkSetup` |
| Completed actions | `daily_accountability.completed_count` (per rep/identity/activity/date) | `record_activity_event` RPC only |
| Attendance | `rep_day` | rep-day services |

A lane belongs to the **channel**, never to an operator. Operators contribute
toward it; `daily_accountability` records who did what.

## 3. The one write path

`src/lib/operations/work-setup-write.ts` → `saveWorkSetup`:

1. validate org, identity, profile link, archived state;
2. validate every named rep is in the organization;
3. validate seat exclusivity (primary ∉ operators/backups, no operator/backup overlap);
4. `saveResponsibilityChain` (coverage + eligibility + acknowledgements + audit);
5. upsert the provided target lanes (one active row per identity+activity);
6. replace the provided allocations, rejecting any lane whose shares exceed its target.

Every management API funnels through this service. Components never write
`profile_coverage`, `identity_assignments`, `daily_target_plans` or
`daily_plan_allocations` directly.

## 4. The one read path

`src/lib/operations/work-setup.ts` → `loadWorkSetup`:

- `getAccountabilityLedger` — the canonical lane projection + populations;
- `loadCanonicalProfileAssignments` — primary / operators / backups;
- `revenue_identities` — the account authority;
- `countOverdueAssignedByRep` — overdue tasks.

The payload carries distinct named totals:

| Field | Meaning |
|---|---|
| `plannedRequirement` | Σ targetable effective lanes |
| `allocatedTarget` | personal expectation on targetable lanes |
| `unallocatedTarget` | `plannedRequirement - allocatedTarget` |
| `completedActions` | Σ lane completion, each lane once |
| `remainingAllocated` | `allocatedTarget - completedActions` |
| `remainingOrganization` | `tracked - completedActions` |
| `overdueTasks` | overdue assigned tasks |
| `activePeople` / `activeAccounts` | coverage counts |

## 5. Route map

| Old surface | New home |
|---|---|
| Admin → Daily Targets (`TargetsManager`) | Admin → **Work Setup** (`/admin/targets`, `WorkSetupManager`) |
| `/admin/control-center` Profiles/Team tabs | read-only drilldowns; primary actions link to Work Setup |
| `/profile-intelligence?tab=identities` assign dialog | identity CRUD stays; assignment links to Work Setup |
| `/team/coverage`, `/team/targets`, `/team/workload`, `/team/activity` | redirects (already in `next.config.ts`) |
| `/admin/command`, `/admin/command-center`, `/admin/accountability` | redirects to `/team` |

## 6. Invariants

```
plannedRequirement = allocatedTarget + unallocatedTarget
completedActions   = Σ lane.completed              (each lane once)
lanePersonalTarget = allocation ?? (seats > 1 ? 0 : lane.target)
repRemaining       = max(0, repAssigned - repCompleted)
shared requirement contributes once to the organization
completed work is credited to the authorized operator
```

`docs/RELAY_DAILY_ACCOUNTING_RECONCILIATION.md` contains the live ledger that
proves these on real data.
