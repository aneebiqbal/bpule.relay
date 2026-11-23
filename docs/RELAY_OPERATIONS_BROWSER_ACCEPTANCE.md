# Relay — Operations Browser Acceptance

**Environment:** `next dev` on `http://localhost:3000`, production database
(`relay_prod_final`), signed in as `aneeb@scout.dev` (Owner · BD).
**Business date:** `2026-11-23` (Asia/Karachi).
**Method:** in-app Chromium, accessibility snapshots plus same-origin API reads.
No writes were performed through the UI.

---

## 1. Surfaces verified

| Surface | Result |
|---|---|
| Admin → Work Setup (`/admin/targets`) | renders the canonical stat strip and a 14-row account table |
| Work Setup drawer | opens on row click; primary / operators / backups / target plan / allocation / save |
| Team → Today (`/team`) | `Target today 0 / 419`, `419 remaining` |
| Team → People (`/team/people`) | Ahmad `0 / 81`, Madiha `0 / 12` |
| Team → Profiles (`/team/profiles`) | Aleena Saman LinkedIn `0 / 78` (was `0 / 156`) |
| Rep day detail (`/api/admin/team-day/<ahmad>`) | `totals.target = 81`, shared lanes `0` |
| Admin accountability (`/api/admin/accountability`) | `requirement 419`, `tracked 431`, `assigned 97`, `unallocated 334` |

## 2. Cross-surface agreement (the core invariant)

```
Work Setup   plannedRequirement 419
Team Today   target today 0 / 419
Accountability API  requirement 419
```

All three read `src/lib/execution/accountability.ts`. Before this work, Admin
Targets reported a different population (`Σ active target_count`, 431) and Team
Today reported a personal remainder.

## 3. Shared lanes are counted once

| Account | Before | After | Canonical requirement |
|---|---|---|---|
| Aleena Saman · linkedin | 0 / **156** | 0 / **78** | 78 |
| Fizza · linkedin | 0 / 150 | 0 / 75 | 75 |
| Hassan · linkedin | 0 / 180 | 0 / 90 | 90 |

Root cause: `loadTeamProfileDirectory` summed `goal.target` once per seat. Fixed by
taking the lane target once per `(identity, activity)` and summing only the
operators' completions.

## 4. Rep Today shows the rep's allocation

Ahmad's rep-day detail reports `target = 81` — the canonical personal expectation
(solo lanes plus explicit allocations). Shared lanes report `0`. Before the fix the
loader read every active org plan and reported the organization total against one
rep's completion.

## 5. Work Setup drawer

Opened on Aleena Saman · LinkedIn:

- Primary rep select.
- Additional operators chips (Ahmad, anas, Aneeb, Dawood, Hassan).
- Backups chips.
- Daily target plan: Connections, DMs, Follow-ups, Prospects captured, prefilled
  from the existing lanes; "Presets fill the fields; nothing is written until you save."
- Allocation: per-lane `0/30`, `0/30`, `0/3`, `0/15` with Madiha and Dawood.
- Cancel / Save assignment.

No save was clicked, so production data is unchanged.

## 6. Issues surfaced

The table flags `Unassigned`, `No target`, `Allocation without seat` and
`Archived`. On the live data the `Aneeb · upwork` row shows **Allocation without
seat** — an allocation whose rep holds no seat, matching the canonical
`unseatedAllocationUnits = 4`.

## 7. Midnight rollover

`BusinessDayRefresh` is mounted in the app layout with the policy timezone and
business date, and calls `router.refresh()` at the next organization-local
midnight plus on focus/visibility. The business date is resolved server-side by
`orgDate(currentInstant(), policy.timezone)`; no browser date string participates.
Unit coverage: `tests/business-day-rollover.test.ts`.

## 8. Not verified here

- The full save → rep-acknowledges → admin-sees journey was **not** executed
  against production (it would write live data). It is covered by the unit and
  live-contract suites (`tests/targets-missing-add.test.ts`,
  `tests/v611-multi-operator-contracts.test.ts`).
- Screenshots could not be captured: the desktop window was not visible to the
  agent, and `browser.screenshot` requires a visible tab.
