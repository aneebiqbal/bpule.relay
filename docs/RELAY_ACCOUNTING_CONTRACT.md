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
| `assigned` | solo lane → full target; allocated lane → the rep's allocation; shared unallocated lane → 0. |
| `unallocated` | `tracked - assigned`. Shared work with no explicit share. |
| `completed` | sum over lanes of the lane's `completed_count` (each lane once). |
| `remaining` | `max(0, tracked - completed)`. |

A lane's completion is the **sum of its operators' contributions** — a shared
lane is never duplicated into a personal total.

## 3. Invariants (tested)

```
assigned + unallocated = tracked
requirement ≤ tracked
lane.completed = Σ lane.contributions
```

`tests/accountability-service.test.ts` asserts all three against the live
organization.

## 4. API

| Method | Returns |
|---|---|
| `getOrganizationDailySummary` | `{ tracked, requirement, assigned, unseatedAllocationUnits, unallocated, completed, remaining, reps[], lanes[] }` |
| `getRepDailySummary` | one rep's `{ assigned, completed, remaining, sharedTarget, lanes[] }` |
| `getProfileDailySummary` | one channel's lanes |
| `getAssignmentAllocations` | every explicit allocation |
| `getActivityCredits` | raw `daily_accountability` rows |
| `getOverdueWork` | delegates to `countOverdueAssignedByRep` |
| `getAttendanceSummary` | `rep_day` check-in / close rows |

## 5. Activity-credit policy

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

## 6. Business date

The business date is `orgDate(currentInstant(), policy.timezone)`. Storage stays
UTC; boundaries are resolved with `businessDateRange`. A user's browser timezone
never participates.

`BusinessDayRefresh` (`src/components/clock/business-day-refresh.tsx`) schedules
a `router.refresh()` at the next local midnight and re-checks on focus /
visibility, so an open tab rolls over without a sign-out.

## 7. Migration note

The legacy `daily_targets` table is retained for history but is **not read** by
any current surface. `daily_target_plans` is the authority.
