# Relay — Daily Accounting Contract

**Branch:** `feat/relay-job-intelligence-v2`
**Authority:** `src/lib/execution/accountability.ts`
**Status:** implemented and tested. All target-bearing surfaces read this module.

---

## 1. One projection

Every number that answers "what is expected today, and what was done" is derived
from `getOrganizationDailySummary`. No page or API rebuilds a total from
partially loaded rows.

```
loadAccountabilityLanes(client, { orgId, businessDate })
  ├─ daily_target_plans   active + effective on the business date
  ├─ profile_coverage     active PRIMARY / OPERATOR seats
  ├─ daily_plan_allocations  active per-operator shares
  ├─ daily_accountability    completed_count per rep / lane / day
  └─ revenue_identities      channel + profile mapping
```

## 2. Definitions

| Term | Definition |
|---|---|
| **lane** | one `(identity, activity_type)` target. It belongs to the **channel**, never to an operator. |
| `tracked` | `sum(target_count)` over every unique active lane. |
| `requirement` | `sum(target_count)` over unique **targetable** lanes. Tracked-only lanes (e.g. proposals) are not a requirement. |
| `trackedNonTargetable` | `tracked - requirement`. |
| `assigned` | solo lane → full target; allocated lane → the sum of allocation rows; shared unallocated lane → 0. |
| `personal` | sum over reps of `lanePersonalTarget` (seated allocations + solo lanes). |
| `unseatedAllocationUnits` | allocation units whose rep holds no active seat. |
| `unallocated` | `tracked - assigned`. |
| `requirementAssigned` | personal expectation restricted to targetable lanes. |
| `requirementUnallocated` | `requirement - requirementAssigned`. |
| `completed` | sum over lanes of the lane's `completed_count` (each lane once). |

A lane's completion is the **sum of its operators' contributions** — a shared
lane is never duplicated into a personal total.

`lanePersonalTarget(lane, repId)`:
```
allocation for repId  ??  (seats.length > 1 ? 0 : lane.targetCount)
```

## 3. Invariants (tested)

```
assigned + unallocated = tracked              (all lanes)
requirementAssigned + requirementUnallocated = requirement   (targetable lanes)
personal = assigned - unseatedAllocationUnits
requirement ≤ tracked
lane.completed = Σ lane.contributions
```

**The two equations are distinct.** `175 + 238 = 413` reconciles the *tracked*
population; it is not a statement about the 399 targetable requirement. The
requirement reconciles as `165 + 234 = 399`.

## 4. API

| Method | Returns |
|---|---|
| `getOrganizationDailySummary` | `{ tracked, requirement, assigned, unseatedAllocationUnits, unallocated, completed, remaining, reps[], lanes[] }` |
| `getRepDailySummary` | one rep's `{ assigned, completed, remaining, sharedTarget, lanes[] }` |
| `getProfileDailySummary` | one channel's lanes |
| `getAssignmentAllocations` | every explicit allocation |
| `getActivityCredits` | raw `daily_accountability` rows |
| `getAccountabilityLedger` | every lane with owner, profile, channel, allocation, completion |
| `reconcilePopulations` | the population definitions above (pure) |
| `getOverdueWork` | delegates to `countOverdueAssignedByRep` |
| `getAttendanceSummary` | `rep_day` check-in / close rows |

`GET /api/admin/accountability` returns `{ summary, populations, ledger }`.

## 5. Surfaces

| Surface | Reads |
|---|---|
| Admin Command Center | `getOrganizationDailySummary` → `requirement` / `completed` |
| Team Command Center | `getOrganizationDailySummary` → `requirement` / `completed` |
| Rep Today | `getRepTodayAccountability` → per-target `personalTargetCount` (same rule) |
| Responsibility workspace | `personalTargetCount` via `jobsFromTargets` |
| `GET /api/admin/accountability` | `{ summary, populations, ledger }` |

`getRepTodayAccountability` applies `lanePersonalTarget` per lane, so a shared
operator sees their allocation, not the channel requirement. Verified against
the live organization: Ahmad 81 (was 148), Madiha 90 (was 180), Dawood 0 (was
149), Hassan 0 (was 97), Aneeb 0 (was 85).

## 6. Activity-credit policy
- A completed unit is one `daily_accountability.completed_count` row for a
  `(rep, identity, activity, business_date)`.
- Drafts, generated copy, recommendations and failed sends never count
  (`targetTypeForEvent` returns null for them).
- Repeated idempotent events do not create duplicate rows: `action_events` has a
  partial unique index on `(organization_id, idempotency_key)` and the ledger
  select-then-inserts so a retry returns the winning row.
- A draft is not a submitted application: `UPWORK_PROPOSAL_PREPARED` and
  `UPWORK_APPLICATION_SUBMITTED` are counted separately.
- Progress and attendance are separate: `rep_day.check_in_at` never creates
  activity credit, and activity credit never implies a check-in.

## 7. Business date

The business date is `orgDate(currentInstant(), policy.timezone)`. Storage stays
UTC; boundaries are resolved with `businessDateRange`. A user's browser timezone
never participates.

`BusinessDayRefresh` (`src/components/clock/business-day-refresh.tsx`) schedules
a `router.refresh()` at the next local midnight and re-checks on focus /
visibility, so an open tab rolls over without a sign-out.

## 8. Migration note

The legacy `daily_targets` table is retained for history but is **not read** by
any current surface. `daily_target_plans` is the authority.
