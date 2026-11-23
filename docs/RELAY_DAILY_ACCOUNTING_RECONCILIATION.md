# Relay — Daily Accounting Reconciliation

**Method:** read-only run of `scripts/qa/reconcile-operations.mjs` against the
production database, business date `2026-11-23` (Asia/Karachi), organization
`bpulse`. No writes were performed.

---

## 1. Live ledger

| Population | Value |
|---|---|
| `tracked` (effective lanes) | **431** |
| `requirement` (effective targetable lanes) | **419** |
| `trackedNonTargetable` | 12 |
| `assigned` (personal expectation) | **97** |
| `requirementAssigned` | **87** |
| `unallocated` (`tracked - assigned`) | **334** |
| `requirementUnallocated` | **332** |
| `unseatedAllocationUnits` | 4 |
| `completed` | 0 |
| `remaining` (`tracked - completed`) | 431 |
| Σ rep `assigned` | 93 |
| Σ rep `remaining` | 93 |

Invariants hold:

```
requirementAssigned + requirementUnallocated = 87 + 332 = 419 = requirement
assigned + unallocated = 97 + 334 = 431 = tracked
Σ rep assigned = assigned - unseatedAllocationUnits = 97 - 4 = 93
```

## 2. Per rep

| Rep | Assigned | Completed | Remaining |
|---|---|---|---|
| Ahmad | **81** | 0 | 81 |
| Madiha | 12 | 0 | 12 |
| Aneeb | 0 | 0 | 0 |
| Dawood | 0 | 0 | 0 |
| Hassan | 0 | 0 | 0 |

Ahmad's 81 is the canonical personal expectation (a solo lane plus explicit
allocations), not the whole shared account target.

## 3. Per account (targetable requirement)

| Account | Channel | Requirement | Allocated | Seats |
|---|---|---|---|---|
| Aleena Saman | linkedin | 78 | 0 | 2 |
| Aneeb | linkedin | 51 | 0 | 2 |
| Aneeb | upwork | 10 | 4 | 2 |
| Fizza | upwork | 10 | 0 | 2 |
| Fizza | linkedin | 75 | 0 | 2 |
| Hassan | upwork | 10 | 0 | 2 |
| Hassan | linkedin | 90 | 0 | 2 |
| Madiha Irfan | upwork | 10 | 0 | 1 |
| Mehak | upwork | 10 | 0 | 1 |
| Mehak | linkedin | 65 | 0 | 1 |
| Zaira | upwork | 10 | 0 | 2 |

Most lanes are shared and unallocated, which is exactly why the organization
requirement (419) is much larger than the sum of personal expectations (97).
That is not an error — it is work nobody has an explicit share of, and Work Setup
surfaces it as `unallocated` / **No target** issues.

## 4. Explaining the owner's figures

| Observed | What it actually was |
|---|---|
| Admin Targets **417** | Σ every active `daily_target_plans.target_count`, with no effectiveness date and no `targetable` filter. The same metric today is 431 (the data moved). It is not the requirement. |
| Team Today **405 remaining** | A personal-expectation remainder, not the organization requirement. It answers a different question. |
| Rep Ahmad **81** | Canonical personal expectation. Correct and reproduced here. |
| Profile/channel **~156** | A per-channel sum from a screen that projected the lane target onto each rep; it is not a canonical population. |

The fix is not to hardcode any of these. It is to expose the distinct named
populations (`plannedRequirement`, `allocatedTarget`, `unallocatedTarget`,
`completedActions`, `remainingAllocated`, `remainingOrganization`) and have every
screen read them from `accountability.ts`.

## 5. Reproducibility

```bash
node scripts/qa/reconcile-operations.mjs          # first organization
node scripts/qa/reconcile-operations.mjs <orgId>  # a specific organization
```

The script prints the populations, the candidate headline metrics, the per-rep
table, the per-account table and the full lane ledger.
