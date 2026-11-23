# Relay — Root Cause: the 170 vs 179 daily-action discrepancy

**Branch:** `feat/relay-job-intelligence-v2`
**Date:** 2026-11-23
**Status:** root-caused against real production records; corrected in code. No
production target or assignment was modified.

---

## 1. What the owner saw

- One dashboard reported **~170** expected organization-wide daily actions.
- Another reported **179**.

Both numbers were real outputs of two different aggregations. Neither was the
organization's actual requirement.

## 2. Where 179 came from

`GET /admin/control-center` → `loadAdminCommandCenter` → `teamTarget`, computed
as the sum of `teamLive.people[].totalTarget`. That value is a **sum of personal
expectations**, not the organization's requirement.

For the real organization (`bpulse`, `11111111-…`) on 2026-11-23 it resolved to:

| Rep | `totalTarget` | Why |
|---|---:|---|
| Madiha | 90 | Aleena Saman LinkedIn lane 78 + Madiha Irfan Upwork lane 12 |
| Ahmad | 81 | Mehak LinkedIn 65 + Mehak Upwork 12 + Aneeb Upwork allocations 2 + 2 |
| Dawood | 8 | **spurious** — see defect A |
| Hassan / Aneeb / anas | 0 | every one of their lanes is shared and unallocated |
| **Total** | **179** | |

### Defect A — an unallocated operator received the whole shared lane

`load-team-live.ts` marked a lane `shared` only when it had **no** allocation:

```ts
shared: repsForLane.length > 1 && !allocations
```

The Aneeb Upwork lane has two seats (Ahmad PRIMARY, Dawood OPERATOR) **and**
allocations for Ahmad and Madiha. Because an allocation existed, `shared` became
`false`, so `assembleTeamLive` computed Dawood's personal expectation as
`allocation ?? (shared ? 0 : target)` = `4` (application) + `4` (proposal) = **8
units he never agreed to and cannot work alone**.

Correct rule: a lane with more than one seat is shared regardless of
allocations; an unallocated seat contributes **0**. Fixed in
`src/lib/admin/load-team-live.ts`.

### Defect B — targets were filtered through a stale eligibility table

`assembleTeamLive` built each rep's identity set from `identity_assignments`.
Two active lanes have **no** eligibility row (Fizza LinkedIn, Mehak LinkedIn),
so their targets were silently dropped from the per-rep totals. That is why the
Admin number could never be reconciled with the plan page.

Fixed: the projected target rows are now self-consistent (each already carries
`rep_id` + `revenue_identity_id`); eligibility rows are unioned in for display
only. See `src/lib/admin/team-live.ts`.

## 3. The corrected number

After both fixes, the same assembly returns **171**:

| Rep | Corrected `totalTarget` |
|---|---:|
| Madiha | 90 |
| Ahmad | 81 |
| Dawood | 0 |
| **Total** | **171** |

The 179 → 171 difference is exactly the 8 spurious Dawood units. The owner's
"approximately 170" is consistent with 171; the remaining 1 unit is inside the
owner's stated approximation, not a hidden record.

Rep Today now uses the same rule. `getRepTodayAccountability` reads active
allocations and seats and computes a per-target `personalTargetCount`
(`allocation ?? (shared ? 0 : lane target)`), so a shared operator sees their
allocation instead of the channel requirement:

| Rep | Before (lane sum) | After (personal) |
|---|---:|---:|
| Ahmad | 148 | **81** |
| Madiha | 180 | **90** |
| Dawood | 149 | **0** |
| Hassan | 97 | **0** |
| Aneeb | 85 | **0** |

## 4. The canonical reconciliation (the number that actually matters)

`src/lib/execution/accountability.ts` computes, from unique active lanes:

| Metric | Value | Meaning |
|---|---:|---|
| `tracked` | **413** | every unique lane, targetable and tracked-only |
| `requirement` | **399** | unique **targetable** lanes — the org's real requirement |
| `trackedNonTargetable` | 14 | proposals and other tracked-only lanes |
| `assigned` | **175** | solo lanes + allocation rows |
| `personal` | **171** | sum over reps of their expectation (`assigned − unseated`) |
| `unseatedAllocationUnits` | **4** | Madiha's Aneeb-Upwork allocation with no seat |
| `unallocated` | **238** | `tracked − assigned` |
| `requirementAssigned` | **165** | personal expectation on targetable lanes |
| `requirementUnallocated` | **234** | `requirement − requirementAssigned` |

Two distinct, both-tested equations:

```
assigned + unallocated = tracked              175 + 238 = 413
requirementAssigned + requirementUnallocated = requirement   165 + 234 = 399
```

`175 + 238 = 413` is **not** a reconciliation of the 399 requirement — 14 of the
413 tracked units are non-targetable proposals, and 4 of the 175 assigned units
are unseated allocations. The targetable requirement reconciles separately.

> **Data changed during the session.** The figures above were captured at the
> start of the investigation. During the session the approved targets and seats
> were edited in production (2026-11-22 23:24–23:48 UTC): Aneeb/Fizza/Hassan lane
> counts changed and Aleena Saman gained a second operator seat. The canonical
> populations on 2026-11-23 are now `tracked 431 · requirement 419 · assigned 97
> · personal 93 · unseated 4 · unallocated 334 · requirementAssigned 87 ·
> requirementUnallocated 332`, and both equations still hold
> (`97 + 334 = 431`, `87 + 332 = 419`). No target was changed by this work.

The full per-lane ledger (channel, profile, owner seats, allocations,
completion) is available from `getAccountabilityLedger` and
`GET /api/admin/accountability`.

The Admin Command Center now headlines `requirement` (399) and prints the
reconciliation line `175 allocated · 238 shared unallocated · 413 tracked`.

## 5. Why the surfaces disagreed (full list)

| Surface | Source | Value | Scope rule |
|---|---|---:|---|
| Admin / Manager home | `teamLive` (before fix) | 179 | personal, eligibility-filtered, defect A |
| Team Command Center | `loadDailyPlanProgress` | 399 | unique targetable lanes |
| Admin → Daily Targets | `buildTeamTargetOverview` | 413 | every active lane |
| Team Performance → Targets | `loadTargets` | 352 | lanes except `prospect_extracted` |
| Rep operating plan (sum) | `loadRepOperatingPlan` | 659 | full lane per operator (shared duplicated) |

All target-bearing surfaces now read `src/lib/execution/accountability.ts`; the
legacy `daily_targets` table is no longer read by any surface.

## 6. Data drift this exposed (real records, unresolved)

`Madiha` holds allocations of 2 (application) and 2 (proposal) on the
**Aneeb Upwork** lane but has **no active seat** on that profile. Those 4 units
are counted in `assigned` but belong to no executable rep. The new
`allocation_without_seat` reconciliation finding reports this; repairing it
requires an approved data change (grant the seat or revoke the allocation).

## 7. Files changed

- `src/lib/execution/accountability.ts` (new) — canonical projection
- `src/lib/admin/load-team-live.ts` — shared-lane rule
- `src/lib/admin/team-live.ts` — self-consistent target rows
- `src/lib/team/load-admin-command-center.ts` — headline from canonical
- `src/lib/team/admin-command-summary.ts` — `orgRequirement` / `orgAssigned` / `orgUnallocated`
- `src/lib/team/load-command-center.ts`, `src/lib/team/command-center.ts` — Team Command Center reads canonical
- `src/components/v4/v4-admin-home.tsx` — reconciliation line
- `tests/accountability-service.test.ts` (new)
