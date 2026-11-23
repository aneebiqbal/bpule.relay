# Relay — Accounting and Assignments

**Verified:** 2026-11-23 against production `bpulse` (`11111111-…`), read-only.

## 1. Canonical projection

`src/lib/execution/accountability.ts` is the ONE projection. Key functions:

- `lanePersonalTarget` (:250) — allocation wins; shared (>1 seat) with no
  allocation = 0; solo seat = lane target.
- `getOrganizationDailySummary` (:260) — sums lanes; `assigned` counts a solo
  lane target or the sum of allocations otherwise; `unseatedAllocationUnits`
  sums allocations whose rep holds no seat.
- `reconcilePopulations` (:478) — `requirementAssigned + requirementUnallocated
  = requirement`; `assigned + unallocated = tracked`.

Surfaces that read it: Work Setup (`loadWorkSetup`), Team Today, People,
Profiles, Rep Today (`/api/rep/today`), Admin Command Center,
`/api/admin/accountability`.

## 2. Live reconciliation (production, business date 2026-11-23, Asia/Karachi)

Command: `node scripts/qa/reconcile-operations.mjs 11111111-1111-1111-1111-111111111111`

```
lanes 32   identities 11
tracked 431   requirement 419   trackedNonTargetable 12
assigned 127  requirementAssigned 117
unallocated 304   requirementUnallocated 302
unseatedAllocationUnits 4   completed 310   remaining 121
sum of rep assigned (personal) 123
```

Invariants:

| Equation | Check |
|---|---|
| `assigned + unallocated = tracked` | 127 + 304 = 431 ✓ |
| `requirementAssigned + requirementUnallocated = requirement` | 117 + 302 = 419 ✓ |
| `personal = assigned - unseatedAllocationUnits` | 123 = 127 - 4 ✓ |

Per-rep (assigned / completed / remaining): Ahmad 81/104/0 · Aneeb 0/0/0 ·
Dawood 5/178/0 · Hassan 0/1/0 · Madiha 37/27/10.

> The earlier certification recorded `assigned 87, completed 0` earlier the same
> day; the day has since progressed. The invariants hold at both snapshots.

## 3. Defects

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| R-02 | P1 | Allocation replace could zero a lane on partial failure | `work-setup-write.ts` old ordering + `dpa_active_uniq` | 
| R-09 | P2 | `personal = assigned - unseated` breaks on a solo-seat lane with an allocation | `accountability.ts:307-308` vs `:251-252` |
| R-10 | P2 | `allocations: []` cannot clear shares | `work-setup-write.ts:180-194` |
| R-11 | P2 | Allocations may name unseated reps | `work-setup-write.ts:186` |
| R-13 | P1 | No transaction / no revision check | `db/types.ts:104-115`; `work-setup-write.ts:115-231` |

## 4. Writers to the canonical tables

`saveWorkSetup` is the only Work Setup writer, but not the only mutator:

| Table | Writers |
|---|---|
| `daily_target_plans` | Work Setup; coverage seed (`ensureTargets`); store admin target CRUD; identity archive |
| `daily_plan_allocations` | Work Setup; `/api/admin/targets/[id]/allocations` |
| `identity_assignments` | `syncChannelEligibility`; `configureCoverageStatement`; `assignBackupResponsibility` direct upsert; `repairAssignmentDrift`; store admin assign |
| `profile_coverage` | `configureCoverageStatement`; legacy path; `backfillProfileCoverage` (dead) |

All writers are organization-scoped at the query level. The assignment
**writer** is shared (`saveResponsibilityChain` / `configureCoverage`), not
duplicated per UI.

## 5. Business date

`orgDate(instant, timezone)` with the zone from `organization_operating_policy`
(fallback `organizations.timezone`). All six canonical surfaces use it.
**Exceptions (R-08):** `/api/admin/targets/route.ts:39`,
`src/lib/profiles/canonical.ts:355`, `/api/admin/targets/[id]/route.ts:70` use
UTC `new Date().toISOString().slice(0,10)`.

No date-keyed cache serves yesterday's data as today's; notification dedupe
keys embed the business date.

## 6. Transaction integrity

`saveWorkSetup` commits seat chain, target lanes and allocations independently.
The allocation loss window was closed this pass (R-02). A full transaction and
optimistic-concurrency check remain outstanding (R-13).
